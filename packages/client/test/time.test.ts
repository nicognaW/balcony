// Seam C: how rows word times.
import { describe, expect, it } from "@effect/vitest";

import { formatRelativeTime, formatWorkingDuration } from "../src/time.ts";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("row times", () => {
  it("word a Working session's elapsed time in seconds, minutes, then hours and minutes", () => {
    expect(formatWorkingDuration(0)).toBe("0s");
    expect(formatWorkingDuration(59 * SECOND + 999)).toBe("59s");
    expect(formatWorkingDuration(MINUTE)).toBe("1m");
    expect(formatWorkingDuration(59 * MINUTE + 59 * SECOND)).toBe("59m");
    expect(formatWorkingDuration(HOUR + 5 * MINUTE)).toBe("1h 5m");
    // A clock a little ahead of the server never shows a negative time.
    expect(formatWorkingDuration(-3 * SECOND)).toBe("0s");
  });

  it("word a Working session's elapsed time past a day in days and hours", () => {
    expect(formatWorkingDuration(23 * HOUR + 59 * MINUTE)).toBe("23h 59m");
    expect(formatWorkingDuration(DAY)).toBe("1d 0h");
    expect(formatWorkingDuration(25 * HOUR + 20 * MINUTE)).toBe("1d 1h");
    expect(formatWorkingDuration(3 * DAY + 23 * HOUR + 59 * MINUTE)).toBe(
      "3d 23h"
    );
  });

  it("word other times compactly, relative to now", () => {
    expect(formatRelativeTime(30 * SECOND)).toBe("now");
    expect(formatRelativeTime(-5 * SECOND)).toBe("now");
    expect(formatRelativeTime(MINUTE)).toBe("1m");
    expect(formatRelativeTime(59 * MINUTE)).toBe("59m");
    expect(formatRelativeTime(HOUR)).toBe("1h");
    expect(formatRelativeTime(23 * HOUR + 59 * MINUTE)).toBe("23h");
    expect(formatRelativeTime(49 * HOUR)).toBe("2d");
  });
});
