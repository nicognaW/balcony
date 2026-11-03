// The connection to the Balcony server, made once when the page loads.
import { connect, redeemPairingCode } from "@balcony/client";
import type { Connection, PairingRefusal } from "@balcony/client";
import { createQueryClient } from "@balcony/client/react";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createContext } from "react";

import { loadToken, saveToken, takeTokenFromUrl } from "./pairing.ts";

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

const connectWith = (token: string): PairedConnection => {
  const connection = connect({ server: window.location.origin, token });

  return { connection, orpc: makeOrpc(connection) };
};

/**
 * Connects with the token from the address (`#token=…`) or from storage;
 * null when this phone isn't paired.
 */
export const connectPaired = (): PairedConnection | null => {
  const token = takeTokenFromUrl() ?? loadToken();

  return token === null ? null : connectWith(token);
};

/**
 * Exchanges the short code `balcony` shows for the token, stores it and
 * connects with it.
 */
export const pairWithCode = async (
  code: string
): Promise<
  { readonly paired: PairedConnection } | { readonly refusal: PairingRefusal }
> => {
  const result = await redeemPairingCode({
    code,
    server: window.location.origin,
  });

  if ("refusal" in result) {
    return result;
  }

  saveToken(result.token);

  return { paired: connectWith(result.token) };
};

export const queryClient = createQueryClient();
