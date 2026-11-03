// The oRPC router: the contract implemented with Effect handlers.
import "@orpc/effect/extensions/effect";
import { timingSafeEqual } from "node:crypto";

import { contract } from "@balcony/contracts";
import type { WithEffectContext } from "@orpc/effect";
import { implement, ORPCError } from "@orpc/server";
import { Effect, Stream } from "effect";

import { Sessions } from "./sessions.ts";

export interface RpcContext extends WithEffectContext<Sessions> {
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
  sessions: {
    watch: os.sessions.watch.use(authed).effect(function* watchSessions() {
      const sessions = yield* Sessions;

      return yield* streamToIterator(sessions.changes);
    }),
  },
});
