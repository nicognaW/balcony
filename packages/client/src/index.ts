// The typed Balcony client over WebSocket, shared by the web app, the mobile
// app and the server's contract tests.
import type { BalconyClient } from "@balcony/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";

export type { BalconyClient } from "@balcony/contracts";

export { createSessionList, WORKING_EXIT_GRACE_MS } from "./session-list.ts";

export type {
  RowMark,
  SessionListModel,
  SessionListUpdate,
  SessionListView,
  SessionRow,
} from "./session-list.ts";

export { formatRelativeTime, formatWorkingDuration } from "./time.ts";

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
  const listeners = new Set<() => void>();

  const setState = (next: ConnectionState) => {
    if (state === next) {
      return;
    }

    state = next;

    for (const listener of listeners) {
      listener();
    }
  };

  const link = new RPCLink({
    connect: () => {
      const socket = new WebSocket(rpcUrl(server, token));
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
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
};
