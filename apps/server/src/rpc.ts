// The oRPC router: the contract implemented with Effect handlers.
import "@orpc/effect/extensions/effect";
import { timingSafeEqual } from "node:crypto";

import { contract } from "@balcony/contracts";
import type { WithEffectContext } from "@orpc/effect";
import { implement, ORPCError } from "@orpc/server";
import { Effect, Stream } from "effect";

import { PairingCodes } from "./pairing-code.ts";
import { SessionMarks } from "./session-marks.ts";
import { Sessions } from "./sessions.ts";

export interface RpcContext extends WithEffectContext<
  PairingCodes | SessionMarks | Sessions
> {
  /** The token the socket connected with, from its `?token=` parameter. */
  readonly token: string | null;
  /** The server's token. */
  readonly serverToken: string;
}

/**
 * An Effect stream as the AsyncIteratorObject oRPC's event iterators expect.
 * Stopping the iterator (client cancel, socket close) interrupts the stream.
 */
const streamToIterator = <A, E, R>(stream: Stream.Stream<A, E, R>) =>
  Effect.map(Effect.context<R>(), (context) => {
    const iterable = Stream.toAsyncIterableWith(stream, context);

    return (async function* iterate() {
      yield* iterable;
    })();
  });

const os = implement(contract).$context<RpcContext>();

const sameToken = (given: string | null, expected: string) => {
  if (given === null) {
    return false;
  }

  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
};

const authed = os.middleware(({ context, next }) => {
  if (!sameToken(context.token, context.serverToken)) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next();
});

export const router = os.router({
  pairing: {
    // Deliberately not `authed`: this is how a phone gets the token.
    exchange: os.pairing.exchange.effect(function* exchangePairingCode({
      errors,
      input,
    }) {
      const codes = yield* PairingCodes;

      const token = yield* codes
        .exchange(input.code.replaceAll(/\D/gu, ""))
        .pipe(
          Effect.mapError((refused) => {
            if (refused.reason === "wrong") {
              return errors.PAIRING_CODE_WRONG({
                data: { attemptsLeft: refused.attemptsLeft },
              });
            }

            return refused.reason === "expired"
              ? errors.PAIRING_CODE_EXPIRED()
              : errors.PAIRING_CODE_LOCKED();
          })
        );

      return { token };
    }),
  },
  sessions: {
    markViewed: os.sessions.markViewed.use(authed).effect(function* markViewed({
      input,
    }) {
      const marks = yield* SessionMarks;
      yield* marks.markViewed(input.id);
    }),
    // Settling only changes Balcony's marks; the agent is never told.
    settle: os.sessions.settle.use(authed).effect(function* settle({ input }) {
      const marks = yield* SessionMarks;
      yield* marks.settle(input.id);
    }),
    unsettle: os.sessions.unsettle.use(authed).effect(function* unsettle({
      input,
    }) {
      const marks = yield* SessionMarks;
      yield* marks.unsettle(input.id);
    }),
    watch: os.sessions.watch.use(authed).effect(function* watchSessions() {
      const sessions = yield* Sessions;

      return yield* streamToIterator(sessions.changes);
    }),
  },
});
