// The typed Balcony client over WebSocket, shared by the web app, the mobile
// app and the server's contract tests.
import type { BalconyClient } from "@balcony/contracts";
import { createORPCClient, ORPCError, safe } from "@orpc/client";
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
   * Closes the socket for good: it never reconnects, and calls made after
   * wait until they are aborted.
   */
  readonly close: () => void;
}

export interface ConnectOptions {
  /** The server's origin, e.g. `http://192.168.1.20:7766`. */
  readonly server: string;
  /** The pairing token, or null to call without one. */
  readonly token: string | null;
  /** Delay between reconnect attempts, in ms. */
  readonly retryDelayMs?: number;
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
 * Runs `call` with a client for `pairing.exchange` over a one-off socket,
 * closed once `call` settles.
 */
const withPairingClient = async <T>(
  server: string,
  call: (client: BalconyClient) => Promise<T>
): Promise<T> => {
  const socket = new WebSocket(rpcUrl(server, null));
  socket.binaryType = "arraybuffer";

  try {
    // No reconnect, so closing the socket ends the link.
    return await call(
      createORPCClient<BalconyClient>(new RPCLink({ connect: () => socket }))
    );
  } finally {
    socket.close();
  }
};

/**
 * Exchanges the short pairing code shown on the Mac for the long-lived token,
 * over a one-off socket that closes afterwards. Fails with the contract's
 * pairing errors (`PAIRING_CODE_WRONG`, `PAIRING_CODE_EXPIRED`,
 * `PAIRING_CODE_LOCKED`).
 */
export const exchangePairingCode = ({
  code,
  server,
}: {
  readonly code: string;
  readonly server: string;
}): Promise<string> =>
  withPairingClient(server, async (client) => {
    const { token } = await client.pairing.exchange({ code });

    return token;
  });

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

/** Why a short code didn't pair, with the tries left after a wrong one. */
export type PairingRefused =
  | { readonly refusal: "wrong"; readonly attemptsLeft: number }
  | { readonly refusal: Exclude<PairingRefusal, "wrong"> };

export type PairingOutcome = { readonly token: string } | PairingRefused;

/**
 * The token a `pairing.exchange` call gave, or why it didn't pair instead
 * of failing, for the pairing screen.
 */
export const pairingOutcome = async (
  exchange: ReturnType<BalconyClient["pairing"]["exchange"]>
): Promise<PairingOutcome> => {
  const { data, definedError, error } = await safe(exchange);

  if (error === null) {
    return { token: data.token };
  }

  switch (definedError?.code) {
    case "PAIRING_CODE_WRONG": {
      return { attemptsLeft: definedError.data.attemptsLeft, refusal: "wrong" };
    }

    case "PAIRING_CODE_EXPIRED": {
      return { refusal: "expired" };
    }

    case "PAIRING_CODE_LOCKED": {
      return { refusal: "locked" };
    }

    default: {
      return { refusal: error instanceof ORPCError ? "other" : "unreachable" };
    }
  }
};

/**
 * Exchanges the short pairing code for the token, as `exchangePairingCode`,
 * but tells why it didn't pair instead of failing, for the pairing screen.
 */
export const redeemPairingCode = ({
  code,
  server,
}: {
  readonly code: string;
  readonly server: string;
}): Promise<PairingOutcome> =>
  withPairingClient(server, (client) =>
    pairingOutcome(client.pairing.exchange({ code }))
  );

const NEW_CODE_HINT =
  "Press Enter in the terminal running balcony for a new one.";

/** What the pairing screens tell the user when a short code didn't pair. */
export const pairingRefusalMessage = (refused: PairingRefused): string => {
  switch (refused.refusal) {
    case "wrong": {
      const tries = refused.attemptsLeft === 1 ? "try" : "tries";

      return `That isn't the code on your Mac. Check it and try again (${refused.attemptsLeft} ${tries} left).`;
    }

    case "expired": {
      return `That code has expired. ${NEW_CODE_HINT}`;
    }

    case "locked": {
      return `Too many wrong tries. ${NEW_CODE_HINT}`;
    }

    case "unreachable": {
      return "Couldn't reach Balcony. Is this phone on the same Wi-Fi as your Mac?";
    }

    default: {
      return "Balcony couldn't pair this phone. Try again.";
    }
  }
};

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

/**
 * Opens a client that reconnects by itself whenever the socket drops, and
 * reports the connection state for an indicator. Calls in flight when the
 * socket drops fail; callers retry them (live queries re-subscribe).
 */
export const connect = ({
  server,
  token,
  retryDelayMs = 1000,
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
  let current: WebSocket | undefined;

  const link = new RPCLink({
    connect: () => {
      if (closed) {
        return parkedSocket();
      }

      const socket = new WebSocket(rpcUrl(server, token));
      current = socket;
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => setState("connected"));
      socket.addEventListener("close", () => {
        if (state === "connected") {
          setState("reconnecting");
        }
      });

      return socket;
    },
    connectOnInit: true,
    reconnect: {
      delay: (info) => (info.attempt === 1 ? 0 : retryDelayMs),
      enabled: true,
      onClose: { delay: retryDelayMs, enabled: true },
    },
  });

  return {
    client: createORPCClient<BalconyClient>(link),
    close: () => {
      closed = true;
      current?.close();
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners = [...listeners, listener];

      return () => {
        listeners = listeners.filter((known) => known !== listener);
      };
    },
  };
};
