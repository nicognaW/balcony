// Seam C: a Transcript as the clients show it, from the live tail and the
// earlier pages loaded with "Load earlier".
import type { TranscriptEntry, TranscriptPage } from "@balcony/contracts";
import { describe, expect, it } from "@effect/vitest";

import { joinTranscript, liveArrivals } from "../src/transcript.ts";
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

/** Agent text with only `text` (empty or whitespace) in it. */
const blank = (id: string, text: string): TranscriptEntry => ({
  id,
  kind: "agent-text",
  text,
});

describe("agent text with nothing in it", () => {
  it("is left out, so it leaves no gap", () => {
    const live = {
      entries: [...entries(0, 2), blank("empty", ""), blank("spaces", " \n ")],
      hasEarlier: true,
    };

    expect(idsOf(joinTranscript(live, [], undefined))).toEqual(ids(0, 2));
  });

  it("is left out of earlier pages too", () => {
    const earlier = {
      entries: [blank("empty", ""), ...entries(0, 2)],
      hasEarlier: false,
    };

    expect(idsOf(joinTranscript(view(2, 4), [earlier], "e2"))).toEqual(
      ids(0, 4)
    );
  });
});

const shown = (from: number, to: number) => new Set(ids(from, to));

describe("entries that arrive live", () => {
  const latest = {
    entries: entries(40, 60),
    hasEarlier: true,
    type: "latest",
  } as const;

  const appended = (from: number, to: number) =>
    ({ entries: entries(from, to), type: "appended" }) as const;

  it("are the appended ones not on screen yet", () => {
    expect([
      ...liveArrivals([latest, appended(60, 62)], shown(40, 60)),
    ]).toEqual(["e60", "e61"]);
  });

  it("leave out appended entries already on screen", () => {
    expect([
      ...liveArrivals(
        [latest, appended(60, 61), appended(61, 62)],
        shown(40, 61)
      ),
    ]).toEqual(["e61"]);
  });

  it("are none on the first render, even for appends held from before", () => {
    expect(liveArrivals([latest, appended(60, 62)], undefined).size).toBe(0);
  });

  it("are never in a newest page, sent first or again after a reconnect", () => {
    const again = { ...latest, entries: entries(45, 65) };

    expect(liveArrivals([latest, again], shown(40, 60)).size).toBe(0);
  });
});
