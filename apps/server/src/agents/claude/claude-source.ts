// Claude sessions, read only from the files Claude already writes (ADR-0001):
// transcripts in `~/.claude/projects/*/*.jsonl` and live status records in
// `~/.claude/sessions/<pid>.json`. Nothing is ever written there.
import path from "node:path";

import type { TranscriptEntry } from "@balcony/contracts";
import type { Duration } from "effect";
import { Effect, FileSystem, Option, Schedule, Stream } from "effect";

import type { AgentSource, SourceSession } from "../agent-source.ts";
import { entriesOfLine } from "./entries.ts";
import { parseStatusFile, statusFilePid } from "./status-files.ts";
import type { LiveStatus } from "./status-files.ts";
import {
  branchOf,
  emptySummary,
  foldLine,
  statusOf,
  titleOf,
} from "./transcript.ts";
import type { TranscriptSummary } from "./transcript.ts";

export interface ClaudeSourceOptions {
  /** Claude's folder, normally `~/.claude`. */
  readonly claudeDir: string;
  /** How often to look for changes. */
  readonly pollInterval: Duration.Input;
  /** The current time in epoch ms; tests pin it to the fixtures' time. */
  readonly now: () => number;
}

/** Sessions are listed while their last message is this recent. */
const LIST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How far into a transcript we've read, and what it said so far. */
interface ReadState<A> {
  readonly size: number;
  readonly mtime: number;
  /** The file's inode: a new one means the file was replaced. */
  readonly ino: bigint | undefined;
  /** Bytes consumed: everything up to the last complete line. */
  readonly offset: number;
  /** The last bytes consumed, to tell an append from a rewrite. */
  readonly tail: Uint8Array;
  readonly value: A;
}

/** How many bytes before the offset are checked to be unchanged. */
const TAIL_SIZE = 256;

const startsWith = (bytes: Uint8Array, prefix: Uint8Array) =>
  bytes.length >= prefix.length &&
  prefix.every((byte, index) => bytes[index] === byte);

const NEWLINE = 0x0a;
const decoder = new TextDecoder();

const linesOf = (bytes: Uint8Array) => decoder.decode(bytes).split("\n");

const parseLines = (summary: TranscriptSummary, bytes: Uint8Array) => {
  let folded = summary;

  for (const text of linesOf(bytes)) {
    folded = foldLine(folded, text);
  }

  return folded;
};

/** A transcript's entries, and their ids to drop lines written twice. */
interface Entries {
  readonly list: readonly TranscriptEntry[];
  readonly ids: ReadonlySet<string>;
}

const noEntries: Entries = { ids: new Set(), list: [] };

const parseEntries = (known: Entries, bytes: Uint8Array): Entries => {
  let ids: Set<string> | undefined;
  const added: TranscriptEntry[] = [];

  for (const entry of linesOf(bytes).flatMap(entriesOfLine)) {
    if (!(ids ?? known.ids).has(entry.id)) {
      ids ??= new Set(known.ids);
      ids.add(entry.id);
      added.push(entry);
    }
  }

  return ids === undefined ? known : { ids, list: [...known.list, ...added] };
};

/**
 * Transcripts older than the window are looked at again only every this many
 * scans: they rarely change, and there can be thousands.
 */
const OLD_FILE_RECHECK_SCANS = 10;

/** How many transcripts keep their entries in memory for paging and watching. */
const ENTRY_CACHE_SIZE = 8;

export const makeClaudeSource = Effect.fn("makeClaudeSource")(
  function* makeClaudeSource({
    claudeDir,
    now,
    pollInterval,
  }: ClaudeSourceOptions) {
    const fs = yield* FileSystem.FileSystem;
    const projectsDir = path.join(claudeDir, "projects");
    const sessionsDir = path.join(claudeDir, "sessions");
    const transcripts = new Map<string, ReadState<TranscriptSummary>>();
    const entryCache = new Map<string, ReadState<Entries>>();
    /** Transcript files by session id, as the last scan listed them. */
    let filesById = new Map<string, readonly string[]>();
    /** Files last seen older than the window, and how many scans ago. */
    const oldFiles = new Map<string, number>();

    const listDir = (dir: string) =>
      fs
        .readDirectory(dir)
        .pipe(Effect.orElseSucceed((): readonly string[] => []));

    /** A file's size, modification time (epoch ms) and inode. */
    const statOf = Effect.fn("statOf")(function* statOf(file: string) {
      const info = yield* fs.stat(file);

      return {
        ino: Option.getOrUndefined(info.ino),
        mtime: Option.getOrElse(info.mtime, () => new Date()).getTime(),
        size: Number(info.size),
      };
    });

    type Stat = Effect.Success<ReturnType<typeof statOf>>;

    /** `length` bytes of a file from `position`. */
    const readBytes = (file: string, position: number, length: number) =>
      Effect.scoped(
        Effect.flatMap(fs.open(file), (handle) =>
          handle.readAlloc(length, { position: BigInt(position) })
        )
      ).pipe(Effect.map(Option.getOrElse(() => new Uint8Array())));

    /**
     * Folds what was appended to a transcript since `known` into its value.
     * A file that was replaced, shrank, or changed before the offset was
     * rewritten, so it is folded again from `empty`.
     */
    const readAppended = Effect.fn("readAppended")(function* readAppended<A>(
      file: string,
      stat: Stat,
      known: ReadState<A> | undefined,
      empty: A,
      fold: (value: A, bytes: Uint8Array) => A
    ) {
      if (
        known !== undefined &&
        known.size === stat.size &&
        known.mtime === stat.mtime &&
        known.ino === stat.ino
      ) {
        return known;
      }

      let base =
        known === undefined ||
        known.ino !== stat.ino ||
        stat.size < known.offset
          ? undefined
          : known;

      // Read from the start of the tail, to check it is still there.
      let from = base === undefined ? 0 : base.offset - base.tail.length;
      let read = yield* readBytes(file, from, stat.size - from);

      if (base !== undefined && !startsWith(read, base.tail)) {
        base = undefined;
        from = 0;
        read = yield* readBytes(file, 0, stat.size);
      }

      const bytes = read.subarray(base?.tail.length ?? 0);
      // Keep a half-written last line for the next look.
      const end = bytes.lastIndexOf(NEWLINE) + 1;
      const offset = (base?.offset ?? 0) + end;
      const tailFrom = Math.max(from, offset - TAIL_SIZE);

      const state: ReadState<A> = {
        ino: stat.ino,
        mtime: stat.mtime,
        offset,
        size: stat.size,
        tail: read.slice(tailFrom - from, offset - from),
        value: fold(base?.value ?? empty, bytes.subarray(0, end)),
      };

      return state;
    });

    /**
     * Reads what was appended to a transcript since the last look, or nothing
     * when the file hasn't changed since `cutoff`: its last message is
     * older still, so it isn't listed and needn't be read.
     */
    const readTranscript = Effect.fn("readTranscript")(function* readTranscript(
      file: string,
      cutoff: number
    ) {
      const stat = yield* statOf(file);

      if (stat.mtime < cutoff) {
        transcripts.delete(file);

        return Option.none<ReadState<TranscriptSummary>>();
      }

      const state = yield* readAppended(
        file,
        stat,
        transcripts.get(file),
        emptySummary,
        parseLines
      );

      transcripts.set(file, state);

      return Option.some(state);
    });

    /** A transcript's entries, kept in memory for the few read last. */
    const readEntries = Effect.fn("readEntries")(function* readEntries(
      file: string
    ) {
      const state = yield* readAppended(
        file,
        yield* statOf(file),
        entryCache.get(file),
        noEntries,
        parseEntries
      );

      entryCache.delete(file);
      entryCache.set(file, state);

      for (const stale of entryCache.keys()) {
        if (entryCache.size <= ENTRY_CACHE_SIZE) {
          break;
        }

        entryCache.delete(stale);
      }

      return state.value.list;
    });

    /** Whether to look at a file this scan: old ones only now and then. */
    const dueForLook = (file: string) => {
      const skipped = oldFiles.get(file);

      if (skipped === undefined || skipped + 1 >= OLD_FILE_RECHECK_SCANS) {
        oldFiles.delete(file);

        return true;
      }

      oldFiles.set(file, skipped + 1);

      return false;
    };

    const readTranscripts = Effect.fn("readTranscripts")(
      function* readTranscripts(cutoff: number) {
        const seen = new Set<string>();
        const byId = new Map<string, string[]>();

        const found: {
          id: string;
          summary: TranscriptSummary;
          projectDir: string;
        }[] = [];

        for (const projectDir of yield* listDir(projectsDir)) {
          for (const name of yield* listDir(
            path.join(projectsDir, projectDir)
          )) {
            if (!name.endsWith(".jsonl")) {
              continue;
            }

            const id = name.slice(0, -6);
            const file = path.join(projectsDir, projectDir, name);
            seen.add(file);
            byId.set(id, [...(byId.get(id) ?? []), file]);

            if (!dueForLook(file)) {
              continue;
            }

            const state = yield* readTranscript(file, cutoff).pipe(
              Effect.orElseSucceed(() =>
                Option.none<ReadState<TranscriptSummary>>()
              )
            );

            if (Option.isSome(state)) {
              found.push({ id, projectDir, summary: state.value.value });
            } else {
              oldFiles.set(file, 0);
            }
          }
        }

        for (const file of transcripts.keys()) {
          if (!seen.has(file)) {
            transcripts.delete(file);
          }
        }

        for (const file of oldFiles.keys()) {
          if (!seen.has(file)) {
            oldFiles.delete(file);
          }
        }

        filesById = byId;

        return found;
      }
    );

    /** Every copy of a session's transcript, looking in each project. */
    const findTranscriptFiles = Effect.fn("findTranscriptFiles")(
      function* findTranscriptFiles(sessionId: string) {
        const fileName = `${sessionId}.jsonl`;
        const files: string[] = [];

        for (const projectDir of yield* listDir(projectsDir)) {
          const names = yield* listDir(path.join(projectsDir, projectDir));

          // Only names read from disk become paths, never the caller's id.
          for (const name of names.filter((found) => found === fileName)) {
            files.push(path.join(projectsDir, projectDir, name));
          }
        }

        return files;
      }
    );

    /** Of several copies (see `scan`), the readable one with the newest message. */
    const newestOf = Effect.fn("newestOf")(function* newestOf(
      files: readonly string[]
    ) {
      let best: { file: string; lastMessageAt: number } | undefined;

      for (const file of files) {
        // Any age: an old session opened from a link still has a Transcript.
        const state = yield* Effect.option(readTranscript(file, 0));
        const summary = Option.flatten(state);

        if (Option.isNone(summary)) {
          continue;
        }

        const at = Date.parse(summary.value.value.lastMessageAt ?? "");
        const lastMessageAt = Number.isNaN(at) ? 0 : at;

        if (best === undefined || lastMessageAt > best.lastMessageAt) {
          best = { file, lastMessageAt };
        }
      }

      return Option.map(Option.fromUndefinedOr(best), ({ file }) => file);
    });

    /**
     * The transcript file of a session, from the last scan's listing when it
     * has a readable copy, otherwise looked for afresh.
     */
    const transcriptFileOf = Effect.fn("transcriptFileOf")(
      function* transcriptFileOf(sessionId: string) {
        const listed = yield* newestOf(filesById.get(sessionId) ?? []);

        return Option.isSome(listed)
          ? listed
          : yield* newestOf(yield* findTranscriptFiles(sessionId));
      }
    );

    const transcript = Effect.fn("transcript")(function* transcript(
      sessionId: string
    ) {
      const file = yield* transcriptFileOf(sessionId);

      if (Option.isNone(file)) {
        return Option.none<Stream.Stream<readonly TranscriptEntry[]>>();
      }

      // A file that can't be read at all is no Transcript.
      const first = yield* Effect.option(readEntries(file.value));

      return first.pipe(
        Option.map((entries) =>
          Stream.succeed(entries).pipe(
            Stream.concat(
              Stream.fromEffectSchedule(
                // Unreadable since (e.g. deleted): unchanged.
                Effect.option(readEntries(file.value)),
                Schedule.spaced(pollInterval)
              ).pipe(
                Stream.filter(Option.isSome),
                Stream.map((read) => read.value)
              )
            ),
            Stream.changesWith((a, b) => a === b)
          )
        )
      );
    });

    /** The newest trusted status per session id. */
    const readStatuses = Effect.gen(function* readStatuses() {
      const statuses = new Map<string, LiveStatus>();

      for (const name of yield* listDir(sessionsDir)) {
        const pid = statusFilePid(name);

        if (pid === undefined) {
          continue;
        }

        const text = yield* Effect.option(
          fs.readFileString(path.join(sessionsDir, name))
        );

        const status = Option.isSome(text)
          ? parseStatusFile(pid, text.value)
          : undefined;

        const known = status && statuses.get(status.sessionId);

        if (
          status !== undefined &&
          (known === undefined || status.updatedAt > known.updatedAt)
        ) {
          statuses.set(status.sessionId, status);
        }
      }

      return statuses;
    });

    const scan = Effect.gen(function* scan() {
      const statuses = yield* readStatuses;
      const byId = new Map<string, SourceSession>();
      const cutoff = now() - LIST_WINDOW_MS;

      for (const { id, projectDir, summary } of yield* readTranscripts(
        cutoff
      )) {
        const { lastMessageAt } = summary;

        if (lastMessageAt === undefined || Date.parse(lastMessageAt) < cutoff) {
          continue;
        }

        // The same session can sit in several project folders (it moved, or was
        // teleported). Keep the copy with the newest message, as /resume does.
        const known = byId.get(id);

        if (
          known !== undefined &&
          Date.parse(known.lastMessageAt) >= Date.parse(lastMessageAt)
        ) {
          continue;
        }

        byId.set(id, {
          agent: "claude",
          branch: branchOf(summary),
          id,
          lastMessageAt,
          lastUserMessageAt: summary.lastUserMessageAt ?? null,
          // The folder name encodes the cwd lossily; never decode it.
          project:
            summary.cwd === undefined ? projectDir : path.basename(summary.cwd),
          // The status file is undocumented and may be missing, torn, stale or
          // in a new format; then the transcript says whether a turn is open.
          status: statuses.get(id)?.status ?? statusOf(summary),
          title: titleOf(summary),
          turnEndedAt: summary.turnEndedAt ?? null,
          turnStartedAt: summary.turnStartedAt ?? null,
        });
      }

      return [...byId.values()].toSorted((a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt)
      );
    });

    const source: AgentSource = {
      agent: "claude",
      sessions: Stream.fromEffectSchedule(
        scan,
        Schedule.spaced(pollInterval)
      ).pipe(
        Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b))
      ),
      transcript,
    };

    return source;
  }
);
