// The connection to the Balcony server, made once when the page loads.
import { connect } from "@balcony/client";
import type { Connection } from "@balcony/client";
import { ORPCError } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { createContext } from "react";

import { loadToken, takeTokenFromUrl } from "./pairing.ts";

const makeOrpc = (connection: Connection) =>
  createTanstackQueryUtils(connection.client);

export interface PairedConnection {
  readonly connection: Connection;
  readonly orpc: ReturnType<typeof makeOrpc>;
}

export interface Paired extends PairedConnection {
  /** Forgets the token, e.g. when the server no longer accepts it. */
  readonly unpair: () => void;
}

export const PairedContext = createContext<Paired | null>(null);

/** Whether the server refused the call because the token is wrong. */
export const isUnauthorized = (error: Error | null): boolean =>
  error instanceof ORPCError && error.code === "UNAUTHORIZED";

/**
 * Connects with the token from the address (`#token=…`) or from storage;
 * null when this phone isn't paired.
 */
export const connectPaired = (): PairedConnection | null => {
  const token = takeTokenFromUrl() ?? loadToken();

  if (token === null) {
    return null;
  }

  const connection = connect({ server: window.location.origin, token });

  return { connection, orpc: makeOrpc(connection) };
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live data only: refetching on focus would restart live streams.
      refetchOnWindowFocus: false,
      // Keep retrying through reconnects, unless the pairing is refused.
      retry: (_count, error) => !isUnauthorized(error),
      retryDelay: 1000,
    },
  },
});
