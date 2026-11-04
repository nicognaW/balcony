// The playground's server: the oRPC contract implemented in-process over a
// scenario's data, so the apps' real screens, hooks and view model run
// against it unchanged. It keeps its own state (marks, appends, status
// changes) for as long as the playground stays on the scenario.
import { contract, TRANSCRIPT_PAGE_SIZE } from "@balcony/contracts";
import type {
  BalconyClient,
  Session,
  SessionList,
  TranscriptUpdate,
} from "@balcony/contracts";
import { createRouterClient, implement, ORPCError } from "@orpc/server";

import type { Connection, ConnectionState } from "../index.ts";
import { LIVE_ENTRIES, scenarioOf } from "./scenarios.ts";
import type {
  PlaygroundConnectionState,
  Scenario,
  ScenarioId,
} from "./scenarios.ts";

/** How many wrong codes the fake server takes before it locks. */
const WRONG_TRIES = 5;

export interface Playground extends Connection {
  readonly scenario: Scenario;
  /** The fake server's connection, including `refused`. */
  readonly getConnection: () => PlaygroundConnectionState;
  readonly setConnection: (state: PlaygroundConnectionState) => void;
  /** The sessions as the fake server has them now. */
  readonly getSessions: () => readonly Session[];
  /**
   * Appends the next live entry to a session's Transcript (the scenario's
   * live session by default), as the agent writing would.
   */
  readonly append: (sessionId?: string) => void;
  /** Switches a session between Working and Waiting, as a turn starting or ending. */
  readonly toggleStatus: (sessionId?: string) => void;
}

export interface PlaygroundOptions {
  readonly scenario: ScenarioId;
  /** The clock, in epoch ms. */
  readonly now?: () => number;
  /**
   * How often the live scenario changes by itself (alternating appends with
   * a status change every third step), or null for never.
   */
  readonly autoplayMs?: number | null;
}

type Listener = () => void;

/**
 * Waits for `ready` to hold, checking whenever `subscribe` reports a change.
 * Rejects with the signal's reason when the call is aborted.
 */
const until = async (
  ready: () => boolean,
  subscribe: (listener: Listener) => () => void,
  signal: AbortSignal | undefined
): Promise<void> => {
  if (ready()) {
    return;
  }

  const cleanups: (() => void)[] = [];

  const cleanUp = () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };

  // oxlint-disable-next-line promise/avoid-new -- waits on listeners, which have no promise of their own.
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal?.reason);

    cleanups.push(
      subscribe(() => {
        if (ready()) {
          resolve();
        }
      })
    );
    signal?.addEventListener("abort", onAbort);
    cleanups.push(() => signal?.removeEventListener("abort", onAbort));
  }).finally(cleanUp);
};

/** The connection state a real link would report for the fake's state. */
const linkState = (state: PlaygroundConnectionState): ConnectionState =>
  state === "refused" ? "connected" : state;

export const createPlayground = ({
  autoplayMs = 3000,
  now = Date.now,
  scenario: id,
}: PlaygroundOptions): Playground => {
  const scenario = scenarioOf(id);
  const data = scenario.data(now());
  // Replaced, never changed in place: live calls send it again only once
  // it is a new list.
  let list: SessionList = { sessions: data.sessions };

  const transcripts = new Map(
    [...data.transcripts].map(([key, entries]) => [key, [...entries]])
  );

  let { connection } = scenario;
  let wrongTries = 0;
  let closed = false;
  let steps = 0;
  let appends = 0;

  // Every change (data or connection) wakes every waiting call, which then
  // checks what it is waiting for.
  let listeners: readonly Listener[] = [];

  const subscribe = (listener: Listener) => {
    listeners = [...listeners, listener];

    return () => {
      listeners = listeners.filter((known) => known !== listener);
    };
  };

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  // Changes are delivered only while connected: a reconnecting link holds
  // them until it is back.
  const delivering = () => connection === "connected" || closed;

  const iso = () => new Date(now()).toISOString();

  const update = (sessionId: string, change: (target: Session) => Session) => {
    list = {
      sessions: list.sessions.map((target) =>
        target.id === sessionId ? change(target) : target
      ),
    };
    notify();
  };

  const os = implement(contract);

  // Calls wait for the socket to open, as on a real link.
  const opened = os.middleware(async ({ next, signal }) => {
    await until(() => connection !== "connecting" || closed, subscribe, signal);

    return next();
  });

  const accepted = os.middleware(({ next }) => {
    if (connection === "refused") {
      throw new ORPCError("UNAUTHORIZED");
    }

    return next();
  });

  /**
   * Follows `read` live: its value now, then each new value once it differs
   * from the last one sent, while changes are being delivered. Ends when the
   * playground closes; fails with UNAUTHORIZED once the token is refused.
   */
  const follow = <T>(
    read: () => T,
    signal: AbortSignal | undefined
  ): AsyncGenerator<Awaited<T>, void> => {
    let last: { readonly value: T } | undefined;

    const next = async (): Promise<IteratorResult<T, undefined>> => {
      if (last !== undefined) {
        const sent = last.value;

        await until(
          () =>
            closed ||
            connection === "refused" ||
            (delivering() && read() !== sent),
          subscribe,
          signal
        );
      }

      if (closed) {
        return { done: true, value: undefined };
      }

      // The server stopped accepting the token: live calls end with it.
      if (connection === "refused") {
        throw new ORPCError("UNAUTHORIZED");
      }

      last = { value: read() };

      return { done: false, value: last.value };
    };

    // oRPC takes an AsyncIteratorObject, which a generator is.
    return (async function* followLive() {
      yield* { [Symbol.asyncIterator]: () => ({ next }) };
    })();
  };

  const transcriptOf = (sessionId: string) => {
    const entries = transcripts.get(sessionId);

    if (entries === undefined) {
      throw new ORPCError("NOT_FOUND");
    }

    return entries;
  };

  const router = os.router({
    pairing: {
      exchange: os.pairing.exchange.use(opened).handler(({ errors }) => {
        switch (scenario.pairing) {
          case "expired": {
            throw errors.PAIRING_CODE_EXPIRED();
          }

          case "locked": {
            throw errors.PAIRING_CODE_LOCKED();
          }

          case "wrong": {
            wrongTries += 1;

            if (wrongTries >= WRONG_TRIES) {
              throw errors.PAIRING_CODE_LOCKED();
            }

            throw errors.PAIRING_CODE_WRONG({
              data: { attemptsLeft: WRONG_TRIES - wrongTries },
            });
          }

          default: {
            // The new token is accepted.
            connection = "connected";
            notify();

            return { token: "playground" };
          }
        }
      }),
    },
    sessions: {
      markViewed: os.sessions.markViewed
        .use(opened)
        .use(accepted)
        .handler(({ input }) => {
          update(input.id, (target) => ({ ...target, lastViewedAt: iso() }));
        }),
      settle: os.sessions.settle
        .use(opened)
        .use(accepted)
        .handler(({ input }) => {
          update(input.id, (target) => ({ ...target, settledAt: iso() }));
        }),
      unsettle: os.sessions.unsettle
        .use(opened)
        .use(accepted)
        .handler(({ input }) => {
          update(input.id, (target) => ({
            ...target,
            settledAt: null,
            unsettledAt: iso(),
          }));
        }),
      watch: os.sessions.watch
        .use(opened)
        .use(accepted)
        .handler(({ signal }) => follow(() => list, signal)),
    },
    transcript: {
      read: os.transcript.read
        .use(opened)
        .use(accepted)
        .handler(({ input }) => {
          const entries = transcriptOf(input.sessionId);

          const end =
            input.before === undefined
              ? entries.length
              : entries.findIndex((entry) => entry.id === input.before);

          if (end === -1) {
            throw new ORPCError("NOT_FOUND");
          }

          const start = Math.max(0, end - TRANSCRIPT_PAGE_SIZE);

          return { entries: entries.slice(start, end), hasEarlier: start > 0 };
        }),
      watch: os.transcript.watch
        .use(opened)
        .use(accepted)
        .handler(async function* watchTranscript({ input, signal }) {
          const entries = transcriptOf(input.sessionId);
          const start = Math.max(0, entries.length - TRANSCRIPT_PAGE_SIZE);
          let sent = entries.length;

          const latest: TranscriptUpdate = {
            entries: entries.slice(start),
            hasEarlier: start > 0,
            type: "latest",
          };

          yield latest;

          for await (const length of follow(() => entries.length, signal)) {
            if (length > sent) {
              const appended: TranscriptUpdate = {
                entries: entries.slice(sent),
                type: "appended",
              };

              sent = length;
              yield appended;
            }
          }
        }),
    },
  });

  const client: BalconyClient = createRouterClient(router);

  const firstOpen = () =>
    list.sessions.find((target) => target.settledAt === null)?.id;

  const append = (sessionId = scenario.live?.appendTo ?? firstOpen()) => {
    const entries =
      sessionId === undefined ? undefined : transcripts.get(sessionId);

    if (sessionId === undefined || entries === undefined) {
      return;
    }

    const fields = LIVE_ENTRIES[appends % LIVE_ENTRIES.length];

    if (fields === undefined) {
      return;
    }

    appends += 1;
    const at = iso();
    entries.push({
      ...fields,
      at,
      id: `${sessionId}-live-${String(appends)}`,
    });

    // New activity un-settles, as on the server.
    update(sessionId, (target) => ({
      ...target,
      lastMessageAt: at,
      settledAt: null,
    }));
  };

  const toggleStatus = (sessionId = scenario.live?.toggle ?? firstOpen()) => {
    if (sessionId === undefined) {
      return;
    }

    const at = iso();

    update(sessionId, (target) =>
      target.status === "working"
        ? { ...target, lastMessageAt: at, status: "waiting", turnEndedAt: at }
        : {
            ...target,
            lastMessageAt: at,
            lastUserMessageAt: at,
            settledAt: null,
            status: "working",
            turnStartedAt: at,
          }
    );
  };

  const timer =
    autoplayMs === null || scenario.live === undefined
      ? undefined
      : setInterval(() => {
          steps += 1;

          if (steps % 3 === 0) {
            toggleStatus();
          } else {
            append();
          }
        }, autoplayMs);

  return {
    append,
    client,
    close: () => {
      closed = true;
      clearInterval(timer);
      notify();
    },
    getConnection: () => connection,
    getSessions: () => list.sessions,
    getState: () => linkState(connection),
    scenario,
    setConnection: (state) => {
      connection = state;
      notify();
    },
    subscribe,
    toggleStatus,
    // The fake's connection changes only when the panel says so; a wakeup
    // just wakes the waiting calls, as any change does.
    wake: notify,
  };
};
