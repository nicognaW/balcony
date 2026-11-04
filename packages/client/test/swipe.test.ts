// Seam C: swipe to settle, as both apps decide it from a finger's movement.
import { describe, expect, it } from "@effect/vitest";

import { swipeArmed, swipeAxis, swipeOffset } from "../src/swipe.ts";

describe("swipe direction lock", () => {
  it("waits until the finger has moved 10 points", () => {
    expect(swipeAxis(0, 0)).toBe("undecided");
    expect(swipeAxis(-9, 0)).toBe("undecided");
    expect(swipeAxis(-6, 7)).toBe("undecided");
    expect(swipeAxis(-10, 0)).toBe("swipe");
  });

  it("swipes when the drag is mostly leftward", () => {
    expect(swipeAxis(-12, 4)).toBe("swipe");
    expect(swipeAxis(-30, -29)).toBe("swipe");
  });

  it("lets a mostly vertical drag scroll the list", () => {
    expect(swipeAxis(-2, 12)).toBe("pass");
    expect(swipeAxis(-10, -10)).toBe("pass");
    expect(swipeAxis(-20, 40)).toBe("pass");
  });

  it("lets a rightward drag go: there is nothing behind the row's left edge", () => {
    expect(swipeAxis(12, 0)).toBe("pass");
  });
});

describe("swipe threshold", () => {
  it("settles a row dragged past 40% of its width", () => {
    // A 320-point row on a phone: the threshold is 128 points.
    expect(swipeArmed(-127, 320)).toBe(false);
    expect(swipeArmed(-128, 320)).toBe(true);
    expect(swipeArmed(-300, 320)).toBe(true);
  });

  it("never asks for more than 160 points on a wide row", () => {
    expect(swipeArmed(-159, 672)).toBe(false);
    expect(swipeArmed(-160, 672)).toBe(true);
  });

  it("springs back a row released short of the threshold, or pulled right", () => {
    expect(swipeArmed(0, 320)).toBe(false);
    expect(swipeArmed(-40, 320)).toBe(false);
    expect(swipeArmed(8, 320)).toBe(false);
  });

  it("does nothing for a row not laid out yet", () => {
    expect(swipeArmed(0, 0)).toBe(false);
    expect(swipeArmed(-10, 0)).toBe(false);
  });
});

describe("swiped row", () => {
  it("follows the finger left", () => {
    expect(swipeOffset(-10, 320)).toBe(-10);
    expect(swipeOffset(-200, 320)).toBe(-200);
  });

  it("stops once it is all the way off", () => {
    expect(swipeOffset(-500, 320)).toBe(-320);
  });

  it("resists being pulled right, the more the further", () => {
    expect(swipeOffset(0, 320)).toBe(0);
    const short = swipeOffset(20, 320);
    const long = swipeOffset(200, 320);
    expect(short).toBeGreaterThan(0);
    expect(short).toBeLessThan(20);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(100);
  });
});
