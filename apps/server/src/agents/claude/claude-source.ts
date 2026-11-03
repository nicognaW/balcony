// Claude sessions, read only from the files Claude already writes (ADR-0001):
// transcripts in `~/.claude/projects/*/*.jsonl` and live status records in
// `~/.claude/sessions/<pid>.json`. Nothing is ever written there.
import path from "node:path";

import type { Session } from "@balcony/contracts";
import type { Duration } from "effect";
import { Effect, FileSystem, Option, Schedule, Stream } from "effect";

import type { AgentSource } from "../agent-source.ts";
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
interface TranscriptState {
  readonly size: number;
  readonly mtime: number;
  /** Bytes consumed: everything up to the last complete line. */
  readonly offset: number;
  readonly summary: TranscriptSummary;
}

const NEWLINE = 0x0a;
const decoder = new TextDecoder();

const parseLines = (bytes: Uint8Array, summary: TranscriptSummary) => {
  let folded = summary;

  for (const text of decoder.decode(bytes).split("\n")) {
    folded = foldLine(folded, text);
  }

  return folded;
};

export const makeClaudeSource = Effect.fn("makeClaudeSource")(
  function* makeClaudeSource({ claudeDir, pollInterval }: ClaudeSourceOptions) {
    const fs = yield* FileSystem.FileSystem;
    const projectsDir = path.join(claudeDir, "projects");
    const sessionsDir = path.join(claudeDir, "sessions");
    const transcripts = new Map<string, TranscriptState>();

    const listDir = (dir: string) =>
      fs
        .readDirectory(dir)
        .pipe(Effect.orElseSucceed((): readonly string[] => []));

    /** Reads what was appended to a transcript since the last look. */
    const readTranscript = Effect.fn("readTranscript")(function* readTranscript(
      file: string
    ) {
      const info = yield* fs.stat(file);
      const size = Number(info.size);
      const mtime = Option.getOrElse(info.mtime, () => new Date(0)).getTime();
      const known = transcripts.get(file);

      if (known !== undefined && known.size === size && known.mtime === mtime) {
        return known;
      }

      // A file that shrank was rewritten: start over.
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

      const state: TranscriptState = {
        mtime,
        offset: offset + end,
        size,
        summary: parseLines(
          bytes.subarray(0, end),
          base?.summary ?? emptySummary
        ),
      };

      transcripts.set(file, state);

      return state;
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
              summary: state.value.summary,
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
    };

    return source;
  }
);
