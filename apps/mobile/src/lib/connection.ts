// The connection to the paired Balcony server, with TanStack Query over the
// generated oRPC client, as in the web app.
import { connect, exchangePairingCode } from "@balcony/client";
import type { Connection } from "@balcony/client";
import { ORPCError } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { createContext } from "react";

import { saveServer } from "./saved-server.ts";
import type { SavedServer } from "./saved-server.ts";

const makeOrpc = (connection: Connection) =>
  createTanstackQueryUtils(connection.client);

export interface PairedConnection {
  readonly server: string;
  readonly connection: Connection;
  readonly orpc: ReturnType<typeof makeOrpc>;
}

export interface Paired extends PairedConnection {
  /**
   * Forgets the token and returns to pairing: `refused` when the server no
   * longer accepts it, `asked` when the user chose to pair again.
   */
  readonly unpair: (reason: "refused" | "asked") => void;
}

export const PairedContext = createContext<Paired | null>(null);

/** Whether the server refused the call because the token is wrong. */
export const isUnauthorized = (error: Error | null): boolean =>
  error instanceof ORPCError && error.code === "UNAUTHORIZED";

/** Connects to a server already checked to be on the local network. */
export const connectTo = ({ server, token }: SavedServer): PairedConnection => {
  const connection = connect({ server, token });

  return { connection, orpc: makeOrpc(connection), server };
};

/** Stores a pairing and connects with it. */
export const pairWith = async (saved: SavedServer) => {
  await saveServer(saved);

  return connectTo(saved);
};

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

/**
 * Exchanges the short code `balcony` shows for the token, stores the server
 * and token, and connects.
 */
export const pairWithCode = async (
  server: string,
  code: string
): Promise<
  { readonly paired: PairedConnection } | { readonly refusal: PairingRefusal }
> => {
  let token: string;

  try {
    token = await exchangePairingCode({ code, server });
  } catch (error) {
    return {
      refusal:
        error instanceof ORPCError ? refusalOf(error.code) : "unreachable",
    };
  }

  return { paired: await pairWith({ server, token }) };
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
