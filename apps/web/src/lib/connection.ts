// The connection to the Balcony server this page came from, made once when
// the page loads.
import {
  connectTo,
  createQueryClient,
  pairWithCode,
} from "@balcony/client/react";
import type { PairedConnection } from "@balcony/client/react";

import { loadToken, saveToken, takeTokenFromUrl } from "./pairing.ts";

/**
 * Connects with the token from the address (`#token=…`) or from storage;
 * null when this phone isn't paired.
 */
export const connectPaired = (): PairedConnection | null => {
  const token = takeTokenFromUrl() ?? loadToken();

  return token === null
    ? null
    : connectTo({ server: window.location.origin, token });
};

/**
 * Exchanges the short code `balcony` shows for the token, stores it and
 * connects with it.
 */
export const pairByCode = (code: string) =>
  pairWithCode({ code, save: saveToken, server: window.location.origin });

export const queryClient = createQueryClient();
