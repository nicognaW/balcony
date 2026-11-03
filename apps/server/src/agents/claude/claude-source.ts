// Claude sessions, read only from the files Claude already writes (ADR-0001):
// transcripts in `~/.claude/projects/*/*.jsonl` and live status records in
// `~/.claude/sessions/<pid>.json`. Nothing is ever written there.
import path from "node:path";

import type { Session, TranscriptEntry } from "@balcony/contracts";
import type { Duration } from "effect";
import { Effect, FileSystem, Option, Schedule, Stream } from "effect";

import type { AgentSource } from "../agent-source.ts";
import { entriesOfLine } from "./entries.ts";
import { parseStatusFile, statusFilePid } from "./status-files.ts";
import type { LiveStatus } from "./status-files.ts";
import { emptySummary, foldLine, titleOf } from "./transcript.ts";
import type { TranscriptSummary } from "./transcript.ts";

export interface ClaudeSourceOptions {
  /** Claude's folder, normally `~/.claude`. */
  readonly claudeDir: string;
  /** How often to look for changes. */
  readonly pollInterval: Duration.Input;
}

/** How far into a transcript we've read, and what it said so far. */
interface ReadState<A> {
  readonly size: number;
  readonly mtime: number;
  /** Bytes consumed: everything up to the last complete line. */
  readonly offset: number;
  readonly value: A;
}

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
  const added = linesOf(bytes)
    .flatMap(entriesOfLine)
    .filter((entry) => !known.ids.has(entry.id));

  if (added.length === 0) {
    return known;
  }

  const ids = new Set(known.ids);

  for (const { id } of added) {
    ids.add(id);
  }

  return { ids, list: [...known.list, ...added] };
};

/** How many transcripts keep their entries in memory for paging and watching. */
const ENTRY_CACHE_SIZE = 8;

export const makeClaudeSource = Effect.fn("makeClaudeSource")(
  function* makeClaudeSource({ claudeDir, pollInterval }: ClaudeSourceOptions) {
    const fs = yield* FileSystem.FileSystem;
    const projectsDir = path.join(claudeDir, "projects");
    const sessionsDir = path.join(claudeDir, "sessions");
    const transcripts = new Map<string, ReadState<TranscriptSummary>>();
    const entryCache = new Map<string, ReadState<Entries>>();

    const listDir = (dir: string) =>
      fs
        .readDirectory(dir)
        .pipe(Effect.orElseSucceed((): readonly string[] => []));

    /**
     * Folds what was appended to a transcript since `known` into its value.
     * A file that shrank was rewritten, so it is folded again from `empty`.
     */
    const readAppended = Effect.fn("readAppended")(function* readAppended<A>(
      file: string,
      known: ReadState<A> | undefined,
      empty: A,
      fold: (value: A, bytes: Uint8Array) => A
    ) {
      const info = yield* fs.stat(file);
      const size = Number(info.size);
      const mtime = Option.getOrElse(info.mtime, () => new Date(0)).getTime();

      if (known !== undefined && known.size === size && known.mtime === mtime) {
        return known;
      }

      const base =
        known === undefined || size < known.offset ? undefined : known;

      const offset = base?.offset ?? 0;

      const bytes = yield* Effect.scoped(
        Effect.flatMap(fs.open(file), (handle) =>
          handle.readAlloc(size - offset, { position: BigInt(offset) })
        )
      ).pipe(Effect.map(Option.getOrElse(() => new Uint8Array())));

      // Keep a half-written last line for the next look.
      const end = bytes.lastIndexOf(NEWLINE) + 1;

      const state: ReadState<A> = {
        mtime,
        offset: offset + end,
        size,
        value: fold(base?.value ?? empty, bytes.subarray(0, end)),
      };

      return state;
    });

    /** Reads what was appended to a transcript since the last look. */
    const readTranscript = Effect.fn("readTranscript")(function* readTranscript(
      file: string
    ) {
      const state = yield* readAppended(
        file,
        transcripts.get(file),
        emptySummary,
        parseLines
      );

      transcripts.set(file, state);

      return state;
    });

    /** A transcript's entries, kept in memory for the few read last. */
    const readEntries = Effect.fn("readEntries")(function* readEntries(
      file: string
    ) {
      const state = yield* readAppended(
        file,
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

    const readTranscripts = Effect.gen(function* readTranscripts() {
      const seen = new Set<string>();

      const found: {
        id: string;
        summary: TranscriptSummary;
        projectDir: string;
      }[] = [];

      for (const projectDir of yield* listDir(projectsDir)) {
        for (const name of yield* listDir(path.join(projectsDir, projectDir))) {
          if (!name.endsWith(".jsonl")) {
            continue;
          }

          const file = path.join(projectsDir, projectDir, name);
          seen.add(file);
          const state = yield* Effect.option(readTranscript(file));

          if (Option.isSome(state)) {
            found.push({
              id: name.slice(0, -6),
              projectDir,
              summary: state.value.value,
            });
          }
        }
      }

      for (const file of transcripts.keys()) {
        if (!seen.has(file)) {
          transcripts.delete(file);
        }
      }

      return found;
    });

    /**
     * The transcript file of a session: of several copies (see `scan`), the
     * one with the newest message.
     */
    const transcriptFileOf = Effect.fn("transcriptFileOf")(
      function* transcriptFileOf(sessionId: string) {
        const fileName = `${sessionId}.jsonl`;
        let best: { file: string; lastMessageAt: number } | undefined;

        for (const projectDir of yield* listDir(projectsDir)) {
          const names = yield* listDir(path.join(projectsDir, projectDir));

          // Only names read from disk become paths, never the caller's id.
          for (const name of names.filter((found) => found === fileName)) {
            const file = path.join(projectsDir, projectDir, name);
            const state = yield* Effect.option(readTranscript(file));

            const at = Option.isSome(state)
              ? Date.parse(state.value.value.lastMessageAt ?? "")
              : Number.NaN;

            const lastMessageAt = Number.isNaN(at) ? 0 : at;

            if (best === undefined || lastMessageAt > best.lastMessageAt) {
              best = { file, lastMessageAt };
            }
          }
        }

        return Option.map(Option.fromUndefinedOr(best), ({ file }) => file);
      }
    );

    const transcript = Effect.fn("transcript")(function* transcript(
      sessionId: string
    ) {
      const file = yield* transcriptFileOf(sessionId);

      return file.pipe(
        Option.map((found) =>
          Stream.fromEffectSchedule(
            // An unreadable file (e.g. deleted since) reads as unchanged.
            Effect.option(readEntries(found)),
            Schedule.spaced(pollInterval)
          ).pipe(
            Stream.filter(Option.isSome),
            Stream.map((entries) => entries.value),
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
      const byId = new Map<string, Session>();

      for (const { id, projectDir, summary } of yield* readTranscripts) {
        const { lastMessageAt } = summary;

        if (lastMessageAt === undefined) {
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
          id,
          lastMessageAt,
          // The folder name encodes the cwd lossily; never decode it.
          project:
            summary.cwd === undefined ? projectDir : path.basename(summary.cwd),
          // Without a trusted status record a session counts as Waiting for
          // now; deriving it from the transcript is ticket #6.
          status: statuses.get(id)?.status ?? "waiting",
          title: titleOf(summary),
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
