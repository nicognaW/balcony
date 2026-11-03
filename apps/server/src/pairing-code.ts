// The short pairing code: typed on the phone when the camera can't scan the
// QR code, and exchanged for the token. One code is live at a time; see
// docs/adr/0002-short-pairing-code-in-the-terminal.md.
import { randomInt } from "node:crypto";

import { Context, Effect, Ref } from "effect";

import { sameSecret } from "./same-secret.ts";

export interface PairingCode {
  /** Six digits. */
  readonly code: string;
  /** Epoch ms after which the code is refused. */
  readonly expiresAt: number;
}

/**
 * Why a code was refused; mirrors the contract's pairing errors. `attemptsLeft`
 * counts the wrong tries left, and is 0 unless the reason is "wrong".
 */
export interface PairingCodeRefused {
  readonly reason: "wrong" | "expired" | "locked";
  readonly attemptsLeft: number;
}

export class PairingCodes extends Context.Service<
  PairingCodes,
  {
    /** A fresh code, replacing any live one. */
    readonly issue: Effect.Effect<PairingCode>;
    /** The token, if `code` is the live code. */
    readonly exchange: (
      code: string
    ) => Effect.Effect<string, PairingCodeRefused>;
  }
>()("balcony/PairingCodes") {}

export interface PairingCodeOptions {
  /** The token a correct code is exchanged for. */
  readonly token: string;
  /** The current time in epoch ms. */
  readonly now: () => number;
}

/** How long a code stays valid. */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong tries allowed before the code is locked. */
export const MAX_ATTEMPTS = 5;

interface Live extends PairingCode {
  readonly attemptsLeft: number;
}

/**
 * The code being shown; "locked" after too many wrong tries; null when none
 * was issued, or it expired or was used.
 */
type State = Live | "locked" | null;

const refused = (
  reason: PairingCodeRefused["reason"],
  attemptsLeft = 0
): PairingCodeRefused => ({ attemptsLeft, reason });

const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export const makePairingCodes = Effect.fn("makePairingCodes")(
  function* makePairingCodes(options: PairingCodeOptions) {
    const live = yield* Ref.make<State>(null);

    /** One try at the code: the refusal (null if it matched) and the next state. */
    const attempt = (
      given: string,
      current: State
    ): readonly [PairingCodeRefused | null, State] => {
      if (current === "locked") {
        return [refused("locked"), current];
      }

      if (current === null || options.now() >= current.expiresAt) {
        return [refused("expired"), null];
      }

      if (sameSecret(given, current.code)) {
        return [null, null];
      }

      const attemptsLeft = current.attemptsLeft - 1;

      return attemptsLeft === 0
        ? [refused("locked"), "locked"]
        : [refused("wrong", attemptsLeft), { ...current, attemptsLeft }];
    };

    const exchange = (given: string) =>
      Effect.flatMap(
        Ref.modify(live, (current) => attempt(given, current)),
        (refusal) =>
          refusal === null
            ? Effect.succeed(options.token)
            : Effect.fail(refusal)
      );

    const issue = Effect.suspend(() => {
      const code = newCode();
      const expiresAt = options.now() + PAIRING_CODE_TTL_MS;

      return Effect.as(
        Ref.set(live, { attemptsLeft: MAX_ATTEMPTS, code, expiresAt }),
        { code, expiresAt }
      );
    });

    return PairingCodes.of({ exchange, issue });
  }
);
