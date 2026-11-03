// A Transcript as the clients show it: the live tail from `transcript.watch`
// plus any pages loaded with "Load earlier" from `transcript.read`.
import type {
  TranscriptEntry,
  TranscriptPage,
  TranscriptUpdate,
} from "@balcony/contracts";

export interface TranscriptView {
  /** Oldest first. */
  readonly entries: readonly TranscriptEntry[];
  /** Whether "Load earlier" can load more. */
  readonly hasEarlier: boolean;
}

/**
 * The live tail from a watch's updates so far, in the order received: the
 * last `latest` update plus everything appended after it. Undefined until
 * the first update arrives.
 */
export const liveTranscript = (
  updates: readonly TranscriptUpdate[]
): TranscriptView | undefined => {
  for (let start = updates.length - 1; start >= 0; start -= 1) {
    const latest = updates[start];

    if (latest?.type === "latest") {
      return {
        entries: updates.slice(start).flatMap((update) => update.entries),
        hasEarlier: latest.hasEarlier,
      };
    }
  }

  return undefined;
};

/**
 * The id to page back from: the oldest entry of the live tail. Earlier pages
 * are loaded with `transcript.read({ before })` from here.
 */
export const earliestId = (view: TranscriptView): string | undefined =>
  view.entries[0]?.id;

/**
 * The id earlier pages were loaded back from, while the live tail still
 * holds it; undefined once a new tail (resent after a reconnect, or after
 * the agent rewrote the Transcript) starts after it, since joining pages to
 * that tail would leave out the entries in between.
 */
export const pagingAnchor = (
  live: TranscriptView,
  anchor: string | undefined
): string | undefined =>
  live.entries.some((entry) => entry.id === anchor) ? anchor : undefined;

/**
 * The whole Transcript loaded so far: earlier pages (in the order they were
 * loaded, newest first, from `anchor` back) before the live tail, oldest
 * first, each entry once. Pages the live tail no longer reaches are left out.
 */
export const joinTranscript = (
  live: TranscriptView,
  earlier: readonly TranscriptPage[],
  anchor: string | undefined
): TranscriptView => {
  if (pagingAnchor(live, anchor) === undefined) {
    return live;
  }

  const seen = new Set<string>();
  const entries: TranscriptEntry[] = [];

  const add = (page: readonly TranscriptEntry[]) => {
    for (const entry of page) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        entries.push(entry);
      }
    }
  };

  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    add(earlier[index]?.entries ?? []);
  }

  add(live.entries);

  const oldest = earlier.at(-1);

  return {
    entries,
    hasEarlier: oldest === undefined ? live.hasEarlier : oldest.hasEarlier,
  };
};

const isStep = (entry: TranscriptEntry) =>
  entry.kind !== "user-message" && entry.kind !== "agent-text";

/**
 * The space above an entry: none for the first, tight between steps in a
 * row, loose above anything else.
 */
export const spaceAbove = (
  previous: TranscriptEntry | undefined,
  entry: TranscriptEntry
): "none" | "tight" | "loose" => {
  if (previous === undefined) {
    return "none";
  }

  return isStep(previous) && isStep(entry) ? "tight" : "loose";
};
