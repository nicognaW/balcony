// Transcripts of any agent's sessions: pages read backwards from the newest
// entry, and live watches that send what was appended.
import { TRANSCRIPT_PAGE_SIZE } from "@balcony/contracts";
import type {
  TranscriptEntry,
  TranscriptPage,
  TranscriptPageInput,
  TranscriptUpdate,
} from "@balcony/contracts";
import { Context, Effect, Layer, Option, Stream } from "effect";

import { AgentSources } from "./agents/agent-source.ts";

type Entries = readonly TranscriptEntry[];

/** The page ending just before `before` (or at the newest entry). */
const pageOf = (entries: Entries, before: string | undefined) => {
  const end =
    before === undefined
      ? entries.length
      : entries.findIndex((entry) => entry.id === before);

  if (end === -1) {
    return Option.none<TranscriptPage>();
  }

  const start = Math.max(0, end - TRANSCRIPT_PAGE_SIZE);

  return Option.some<TranscriptPage>({
    entries: entries.slice(start, end),
    hasEarlier: start > 0,
  });
};

const latest = (entries: Entries): TranscriptUpdate => {
  const start = Math.max(0, entries.length - TRANSCRIPT_PAGE_SIZE);

  return {
    entries: entries.slice(start),
    hasEarlier: start > 0,
    type: "latest",
  };
};

/** Whether `next` is `previous` with entries appended. */
const extends_ = (previous: Entries, next: Entries) =>
  previous.length <= next.length &&
  (previous.length === 0 ||
    previous.at(-1)?.id === next[previous.length - 1]?.id);

/** Each whole Transcript as the update a client needs since the last one. */
const toUpdates = (transcripts: Stream.Stream<Entries>) =>
  transcripts.pipe(
    Stream.mapAccum(
      (): Entries | undefined => undefined,
      (previous, next): readonly [Entries, readonly TranscriptUpdate[]] => {
        if (previous === undefined || !extends_(previous, next)) {
          return [next, [latest(next)]];
        }

        if (next.length === previous.length) {
          return [next, []];
        }

        return [
          next,
          [{ entries: next.slice(previous.length), type: "appended" }],
        ];
      }
    )
  );

export class Transcripts extends Context.Service<
  Transcripts,
  {
    /** None when no source has the session, or `before` isn't one of its entries. */
    readonly read: (
      input: TranscriptPageInput
    ) => Effect.Effect<Option.Option<TranscriptPage>>;
    /**
     * The newest page, then what gets appended (see TranscriptUpdate). None
     * when no source has the session.
     */
    readonly watch: (
      sessionId: string
    ) => Effect.Effect<Option.Option<Stream.Stream<TranscriptUpdate>>>;
  }
>()("balcony/Transcripts") {
  static readonly layer = Layer.effect(
    Transcripts,
    Effect.gen(function* makeTranscripts() {
      const sources = yield* AgentSources;

      /** The session's Transcript from the first source that has it. */
      const transcriptOf = Effect.fn("transcriptOf")(function* transcriptOf(
        sessionId: string
      ) {
        for (const source of sources) {
          const found = yield* source.transcript(sessionId);

          if (Option.isSome(found)) {
            return found;
          }
        }

        return Option.none<Stream.Stream<Entries>>();
      });

      const read = Effect.fn("readTranscript")(function* readTranscript({
        before,
        sessionId,
      }: TranscriptPageInput) {
        const transcript = yield* transcriptOf(sessionId);

        if (Option.isNone(transcript)) {
          return Option.none<TranscriptPage>();
        }

        const entries = yield* Stream.runHead(transcript.value);

        return entries.pipe(Option.flatMap((all) => pageOf(all, before)));
      });

      const watch = (sessionId: string) =>
        Effect.map(transcriptOf(sessionId), Option.map(toUpdates));

      return { read, watch };
    })
  );
}
