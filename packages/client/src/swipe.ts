// Swipe to settle: a session row dragged left past a threshold settles (or
// un-settles) it. These decide the swipe from the finger's movement, alike
// for the web app's pointer events and the Android app's Gesture Handler.
// Each is a worklet, so the Android app runs it on the UI thread; the
// directive is a plain string everywhere else.

/** How far the finger moves, in points, before the drag picks an axis. */
export const SWIPE_LOCK_DISTANCE = 10;

/**
 * What a drag is, from how far it has moved across (`dx`, left is negative)
 * and down (`dy`): `undecided` until it has moved far enough to tell,
 * `swipe` when mostly leftward, and `pass` otherwise (a vertical drag
 * scrolls the list; a rightward one has nothing to reveal). Once decided it
 * stays decided for that touch.
 */
export const swipeAxis = (
  dx: number,
  dy: number
): "undecided" | "swipe" | "pass" => {
  "worklet";

  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_LOCK_DISTANCE) {
    return "undecided";
  }

  return -dx > Math.abs(dy) ? "swipe" : "pass";
};

/**
 * Where a row of `width` is drawn, in points across, while the finger is
 * `dx` from where it went down: with the finger leftward, up to all the way
 * off; rightward, rubber-banded, as nothing is behind its left edge.
 */
export const swipeOffset = (dx: number, width: number): number => {
  "worklet";

  if (dx <= 0) {
    return Math.max(dx, -width);
  }

  // Apple's rubber band: the further past the edge, the less it follows.
  const constant = 0.55;

  return (dx * width * constant) / (width + constant * dx);
};

/** How far left, in points, a row of `width` must go to settle. */
export const settleDistance = (width: number): number => {
  "worklet";

  return Math.min(width * 0.4, 160);
};

/**
 * Whether a row of `width`, drawn `offset` points across (left is
 * negative), is past the threshold: released there, it settles; short of
 * it, it springs back. A row not laid out yet (no width) never is.
 */
export const swipeArmed = (offset: number, width: number): boolean => {
  "worklet";

  return width > 0 && -offset >= settleDistance(width);
};
