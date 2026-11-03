// Seam C: a Transcript as the clients show it, from the live tail and the
// earlier pages loaded with "Load earlier".
import type { TranscriptEntry, TranscriptPage } from "@balcony/contracts";
import { describe, expect, it } from "@effect/vitest";

import { joinTranscript } from "../src/transcript.ts";
import type { TranscriptView } from "../src/transcript.ts";

/** Entries numbered `from` up to (not including) `to`. */
const entries = (from: number, to: number): TranscriptEntry[] =>
  Array.from({ length: to - from }, (_, index) => ({
    id: `e${from + index}`,
    kind: "agent-text",
    text: `Entry ${from + index}`,
  }));

/** The page or live tail of entries `from` up to `to`. */
const view = (from: number, to: number): TranscriptPage & TranscriptView => ({
  entries: entries(from, to),
  hasEarlier: from > 0,
});

const ids = (from: number, to: number) =>
  entries(from, to).map((entry) => entry.id);

const idsOf = (transcript: TranscriptView) =>
  transcript.entries.map((entry) => entry.id);

describe("a Transcript with earlier pages", () => {
  it("puts the pages loaded before the live tail, oldest first", () => {
    // Loaded back from e40, the tail's oldest entry when first pressed.
    const joined = joinTranscript(
      view(40, 61),
      [view(20, 40), view(0, 20)],
      "e40"
    );

    expect(idsOf(joined)).toEqual(ids(0, 61));
    expect(joined.hasEarlier).toBe(false);
  });

  it("drops the pages when a new live tail no longer reaches them, rather than leave a gap", () => {
    // The watch resent the newest page after a reconnect; entries 40 to 79
    // came in meanwhile, so the tail now starts at e80.
    const joined = joinTranscript(view(80, 100), [view(20, 40)], "e40");

    expect(idsOf(joined)).toEqual(ids(80, 100));
    expect(joined.hasEarlier).toBe(true);
  });

  it("keeps the pages when a new live tail still reaches them", () => {
    const joined = joinTranscript(view(30, 62), [view(20, 40)], "e40");

    expect(idsOf(joined)).toEqual(ids(20, 62));
  });
});
