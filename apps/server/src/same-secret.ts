import { timingSafeEqual } from "node:crypto";

/**
 * Whether a secret given by a client (the token, a pairing code) is the
 * expected one, in time that doesn't tell how much of it matched.
 */
export const sameSecret = (given: string | null, expected: string) => {
  if (given === null) {
    return false;
  }

  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
};
