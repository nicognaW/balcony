// Pairing with a Balcony server and keeping it, with TanStack Query over the
// generated oRPC client, as in the web app.
import {
  connectTo,
  createQueryClient,
  pairWithCode,
} from "@balcony/client/react";
import type { PairedConnection } from "@balcony/client/react";

import { saveServer } from "./saved-server.ts";
import type { SavedServer } from "./saved-server.ts";

/** Stores a pairing and connects with it. */
export const pairWith = async (
  saved: SavedServer
): Promise<PairedConnection> => {
  await saveServer(saved);

  return connectTo(saved);
};

/**
 * Exchanges the short code `balcony` shows for the token, stores the server
 * and token, and connects.
 */
export const pairByCode = (server: string, code: string) =>
  pairWithCode({
    code,
    save: (token) => saveServer({ server, token }),
    server,
  });

export const queryClient = createQueryClient();
