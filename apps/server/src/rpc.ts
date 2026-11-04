// The oRPC router: the contract implemented with Effect handlers.
import "@orpc/effect/extensions/effect";
import { contract } from "@balcony/contracts";
import type { WithEffectContext } from "@orpc/effect";
import { implement, ORPCError } from "@orpc/server";
import { Effect, Option, Stream } from "effect";

import { PairingCodes } from "./pairing-code.ts";
import { sameSecret } from "./same-secret.ts";
import { SessionMarks } from "./session-marks.ts";
import { Sessions } from "./sessions.ts";
import { Transcripts } from "./transcripts.ts";

export interface RpcContext extends WithEffectContext<
  PairingCodes | SessionMarks | Sessions | Transcripts
> {
  /** The token the socket connected with, from its `?token=` parameter. */
  readonly token: string | null;
  /** The server's token. */
  readonly serverToken: string;
}

/**
 * An Effect stream as the AsyncIteratorObject oRPC's event iterators expect.
 * Stopping the iterator (client cancel, socket close) interrupts the stream,
 * even while it waits for a value: an async generator wrapping it would hold
 * the stop until the next value, which `sessions.view` never sends.
 */
const streamToIterator = <A, E, R>(stream: Stream.Stream<A, E, R>) =>
  Effect.map(Effect.context<R>(), (context) => {
    const iterator = Stream.toAsyncIterableWith(stream, context)[
      Symbol.asyncIterator
    ]();

    const object: AsyncIteratorObject<A> = {
      [Symbol.asyncDispose]: async () => {
        await iterator.return?.();
      },
      [Symbol.asyncIterator]: () => object,
      next: () => iterator.next(),
      return: async () =>
        (await iterator.return?.()) ?? { done: true, value: undefined },
    };

    return object;
  });

const os = implement(contract).$context<RpcContext>();

const authed = os.middleware(({ context, next }) => {
  if (!sameSecret(context.token, context.serverToken)) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next();
});

/** The value, or a NOT_FOUND error for the client. */
const orNotFound = <A>(found: Option.Option<A>) =>
  Option.match(found, {
    onNone: () => Effect.fail(new ORPCError("NOT_FOUND")),
    onSome: Effect.succeed,
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
    view: os.sessions.view.use(authed).effect(function* viewSession({ input }) {
      const marks = yield* SessionMarks;

      return yield* streamToIterator(
        Stream.unwrap(Effect.as(marks.view(input.id), Stream.never))
      );
    }),
    watch: os.sessions.watch.use(authed).effect(function* watchSessions() {
      const sessions = yield* Sessions;

      return yield* streamToIterator(sessions.changes);
    }),
  },
  transcript: {
    read: os.transcript.read.use(authed).effect(function* readTranscript({
      input,
    }) {
      const transcripts = yield* Transcripts;

      return yield* Effect.flatMap(transcripts.read(input), orNotFound);
    }),
    watch: os.transcript.watch.use(authed).effect(function* watchTranscript({
      input,
    }) {
      const transcripts = yield* Transcripts;

      const updates = yield* Effect.flatMap(
        transcripts.watch(input.sessionId),
        orNotFound
      );

      return yield* streamToIterator(updates);
    }),
  },
});
