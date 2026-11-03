// The connection to the paired Balcony server, with TanStack Query over the
// generated oRPC client, as in the web app.
import { connect, redeemPairingCode } from "@balcony/client";
import type { Connection, PairingRefusal } from "@balcony/client";
import { createQueryClient } from "@balcony/client/react";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
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
 * Exchanges the short code `balcony` shows for the token, stores the server
 * and token, and connects.
 */
export const pairWithCode = async (
  server: string,
  code: string
): Promise<
  { readonly paired: PairedConnection } | { readonly refusal: PairingRefusal }
> => {
  const result = await redeemPairingCode({ code, server });

  if ("refusal" in result) {
    return result;
  }

  return { paired: await pairWith({ server, token: result.token }) };
};

export const queryClient = createQueryClient();
