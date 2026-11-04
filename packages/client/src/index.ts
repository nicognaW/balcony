// The typed Balcony client over WebSocket, shared by the web app, the mobile
// app and the server's contract tests.
import { PING, PONG } from "@balcony/contracts";
import type { BalconyClient } from "@balcony/contracts";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { WebSocketLike } from "@orpc/client/websocket";

export type { BalconyClient } from "@balcony/contracts";

export {
  createSessionList,
  sessionTitle,
  SETTLED_FIRST_PAGE,
  SETTLED_PAGE,
  settledPage,
  WORKING_EXIT_GRACE_MS,
} from "./session-list.ts";

export type {
  RowMark,
  SessionListModel,
  SessionListUpdate,
  SessionListView,
  SessionRow,
} from "./session-list.ts";

export { formatRelativeTime, formatWorkingDuration } from "./time.ts";

export { keepViewing } from "./viewing.ts";

/**
 * connecting: no socket has opened yet. connected: a socket is open.
 * reconnecting: the socket closed and the link is trying again.
 */
export type ConnectionState = "connecting" | "connected" | "reconnecting";

export interface Connection {
  readonly client: BalconyClient;
  readonly getState: () => ConnectionState;
  /** Calls `listener` on every state change; returns the unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Tells the connection the app came to the foreground or the network
   * changed: it reconnects at once instead of waiting out the retry delay,
   * and an open socket must answer a ping soon or is replaced.
   */
  readonly wake: () => void;
  /**
   * Closes the socket for good: it never reconnects, and calls made after
   * wait until they are aborted.
   */
  readonly close: () => void;
}

/** The parts of a WebSocket the connection uses. */
export type ClientSocket = Pick<
  WebSocket,
  "addEventListener" | "binaryType" | "close" | "readyState" | "send"
>;

export interface ConnectOptions {
  /** The server's origin, e.g. `http://192.168.1.20:7766`. */
  readonly server: string;
  /** The pairing token, or null to call without one. */
  readonly token: string | null;
  /** Delay between reconnect attempts, in ms. */
  readonly retryDelayMs?: number;
  /** How often an open socket pings the server, in ms. */
  readonly pingIntervalMs?: number;
  /** How long a socket may go without opening or a frame before it is dropped. */
  readonly pingTimeoutMs?: number;
  /** How soon an open socket must answer the ping a wakeup sends. */
  readonly wakeProbeMs?: number;
  /** Opens a socket to a URL; the global WebSocket by default. */
  readonly openSocket?: (url: string) => ClientSocket;
}

/** The WebSocket URL of the RPC endpoint for a server origin and token. */
export const rpcUrl = (server: string, token: string | null): string => {
  const url = new URL("/rpc", server);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  if (token !== null) {
    url.searchParams.set("token", token);
  }

  return url.toString();
};

/**
 * Exchanges the short pairing code shown on the Mac for the long-lived token,
 * over a one-off socket that closes afterwards. Fails with the contract's
 * pairing errors (`PAIRING_CODE_WRONG`, `PAIRING_CODE_EXPIRED`,
 * `PAIRING_CODE_LOCKED`).
 */
export const exchangePairingCode = async ({
  code,
  server,
}: {
  readonly code: string;
  readonly server: string;
}): Promise<string> => {
  const socket = new WebSocket(rpcUrl(server, null));
  socket.binaryType = "arraybuffer";

  // No reconnect, so closing the socket ends the link.
  const client = createORPCClient<BalconyClient>(
    new RPCLink({ connect: () => socket })
  );

  try {
    const { token } = await client.pairing.exchange({ code });

    return token;
  } finally {
    socket.close();
  }
};

/** Whether the server refused the call because the token is wrong. */
export const isUnauthorized = (error: Error | null): boolean =>
  error instanceof ORPCError && error.code === "UNAUTHORIZED";

/**
 * Why a short code didn't pair: the contract's pairing errors, `unreachable`
 * when the server couldn't be reached, `other` for anything else.
 */
export type PairingRefusal =
  | "wrong"
  | "expired"
  | "locked"
  | "unreachable"
  | "other";

const refusalOf = (code: string): PairingRefusal => {
  switch (code) {
    case "PAIRING_CODE_WRONG": {
      return "wrong";
    }

    case "PAIRING_CODE_EXPIRED": {
      return "expired";
    }

    case "PAIRING_CODE_LOCKED": {
      return "locked";
    }

    default: {
      return "other";
    }
  }
};

export type PairingOutcome =
  | { readonly token: string }
  | { readonly refusal: PairingRefusal };

/**
 * The token a `pairing.exchange` call gave, or why it didn't pair instead
 * of failing, for the pairing screen.
 */
export const pairingOutcome = async (
  exchange: Promise<{ readonly token: string }>
): Promise<PairingOutcome> => {
  try {
    const { token } = await exchange;

    return { token };
  } catch (error) {
    return {
      refusal:
        error instanceof ORPCError ? refusalOf(error.code) : "unreachable",
    };
  }
};

/**
 * Exchanges the short pairing code for the token, as `exchangePairingCode`,
 * but tells why it didn't pair instead of failing, for the pairing screen.
 */
export const redeemPairingCode = (pairing: {
  readonly code: string;
  readonly server: string;
}): Promise<PairingOutcome> =>
  pairingOutcome(exchangePairingCode(pairing).then((token) => ({ token })));

/**
 * A socket that never opens. The link waits on it instead of reconnecting,
 * which is how a closed connection stays closed: RPCLink can't be stopped.
 */
const parkedSocket = (): WebSocketLike =>
  Object.assign(new EventTarget(), {
    readyState: WebSocket.CONNECTING,
    send: () => {
      throw new Error("The connection is closed");
    },
  });

const OPEN = 1;
const CLOSED = 3;

/** A listener as the link adds one to its socket. */
type SocketListener = Parameters<WebSocketLike["removeEventListener"]>[1];

/**
 * The close the link sees when the connection drops a socket itself. The
 * link reads only its code and reason; React Native has no CloseEvent to
 * build a real one.
 */
const droppedEvent = (reason: string) => {
  const event = { code: 4000, reason, type: "close" };

  // SAFETY: the link's close listeners read only `code` and `reason`.
  return event as CloseEvent;
};

/**
 * The socket as the link sees it: closed as soon as the connection drops it,
 * even while the real one is still closing (over a dead network that can
 * take minutes), so calls fail and the link reconnects at once. Pongs stay
 * out of it.
 */
interface WatchedSocket {
  readonly socket: WebSocketLike;
  /** Closes the real socket and reports it closed now. */
  readonly drop: (reason: string) => void;
  /** Drops the socket unless a frame arrives within `ms`. */
  readonly expectTraffic: (ms: number) => void;
  /**
   * Pings an open socket now, and drops it (open or still opening) unless
   * a frame arrives within `ms`.
   */
  readonly probe: (ms: number) => void;
}

const watchSocket = (
  real: ClientSocket,
  events: {
    readonly onOpen: () => void;
    readonly onTraffic: () => void;
    readonly onClose: () => void;
  }
): WatchedSocket => {
  let listeners: readonly {
    readonly type: string;
    readonly listener: SocketListener;
  }[] = [];

  let ended = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let deadlineAt = Number.POSITIVE_INFINITY;

  const emit = (event: Event) => {
    for (const { listener, type } of listeners) {
      if (type !== event.type) {
        continue;
      }

      if ("handleEvent" in listener) {
        listener.handleEvent(event);
      } else {
        listener(event);
      }
    }
  };

  const end = (event: CloseEvent) => {
    if (ended) {
      return;
    }

    ended = true;
    clearTimeout(deadline);
    events.onClose();
    emit(event);
  };

  real.addEventListener("open", (event) => {
    if (ended) {
      return;
    }

    events.onOpen();
    emit(event);
  });
  real.addEventListener("message", (event) => {
    if (ended) {
      return;
    }

    events.onTraffic();

    if (event.data !== PONG) {
      emit(event);
    }
  });
  real.addEventListener("close", end);
  real.addEventListener("error", emit);

  const socket: WebSocketLike = {
    addEventListener: (type: string, listener: SocketListener) => {
      listeners = [...listeners, { listener, type }];
    },
    get readyState() {
      return ended ? CLOSED : real.readyState;
    },
    removeEventListener: (type: string, listener: SocketListener) => {
      listeners = listeners.filter(
        (known) => known.type !== type || known.listener !== listener
      );
    },
    send: (data) => real.send(data),
  };

  const drop = (reason: string) => {
    real.close();
    end(droppedEvent(reason));
  };

  const expectTraffic = (ms: number) => {
    clearTimeout(deadline);
    deadlineAt = Date.now() + ms;
    deadline = setTimeout(() => drop("No answer to pings"), ms);
  };

  return {
    drop,
    expectTraffic,
    probe: (ms) => {
      if (ended) {
        return;
      }

      if (real.readyState === OPEN) {
        real.send(PING);
      }

      if (deadlineAt - Date.now() > ms) {
        expectTraffic(ms);
      }
    },
    socket,
  };
};

/**
 * Opens a client that reconnects by itself whenever the socket drops, and
 * reports the connection state for an indicator. An open socket pings the
 * server and is dropped when nothing arrives within the ping timeout.
 * Calls in flight when the socket drops fail; callers retry them (live
 * queries re-subscribe).
 */
export const connect = ({
  server,
  token,
  retryDelayMs = 1000,
  pingIntervalMs = 5000,
  pingTimeoutMs = 15_000,
  wakeProbeMs = 3000,
  openSocket = (url) => new WebSocket(url),
}: ConnectOptions): Connection => {
  let state: ConnectionState = "connecting";
  // Replaced, never changed in place, so a listener added while notifying
  // waits for the next change.
  let listeners: readonly (() => void)[] = [];

  const setState = (next: ConnectionState) => {
    if (state === next) {
      return;
    }

    state = next;

    for (const listener of listeners) {
      listener();
    }
  };

  let closed = false;
  let attempts = 0;
  let current: WatchedSocket | undefined;
  /** Ends the wait before the next attempt, while there is one. */
  let skipWait: (() => void) | undefined;

  const waitToRetry = () =>
    // oxlint-disable-next-line promise/avoid-new -- a timer a wakeup can end early, which has no promise of its own.
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        skipWait = undefined;
        resolve();
      }, retryDelayMs);

      skipWait = () => {
        skipWait = undefined;
        clearTimeout(timer);
        resolve();
      };
    });

  const link = new RPCLink({
    connect: async () => {
      // Every attempt but the first waits, whether the last one failed or
      // the socket closed.
      if (attempts > 0 && !closed) {
        await waitToRetry();
      }

      attempts += 1;

      if (closed) {
        return parkedSocket();
      }

      const real = openSocket(rpcUrl(server, token));
      real.binaryType = "arraybuffer";
      let pinger: ReturnType<typeof setInterval> | undefined;

      const watched = watchSocket(real, {
        onClose: () => {
          clearInterval(pinger);

          if (state === "connected") {
            setState("reconnecting");
          }
        },
        onOpen: () => {
          setState("connected");
          watched.expectTraffic(pingTimeoutMs);
          pinger = setInterval(() => real.send(PING), pingIntervalMs);
        },
        onTraffic: () => watched.expectTraffic(pingTimeoutMs),
      });

      // A socket that never opens (the network under it is gone) is
      // dropped too.
      watched.expectTraffic(pingTimeoutMs);
      current = watched;

      return watched.socket;
    },
    connectOnInit: true,
    reconnect: {
      delay: () => 0,
      enabled: true,
      onClose: { delay: 0, enabled: true },
    },
  });

  return {
    client: createORPCClient<BalconyClient>(link),
    close: () => {
      closed = true;
      current?.drop("Closed");
      skipWait?.();
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners = [...listeners, listener];

      return () => {
        listeners = listeners.filter((known) => known !== listener);
      };
    },
    wake: () => {
      if (closed) {
        return;
      }

      if (skipWait !== undefined) {
        skipWait();

        return;
      }

      current?.probe(wakeProbeMs);
    },
  };
};
