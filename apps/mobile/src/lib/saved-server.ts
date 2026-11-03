// The server this phone paired with, kept in the Android keystore so the app
// opens straight into the list next time. The address outlives the token, so
// re-pairing after the token is refused starts from the same address.
import { serverFromAddress } from "@balcony/client/server-address";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

const SERVER_KEY = "balcony.server";
const TOKEN_KEY = "balcony.token";

export interface SavedServer {
  /** The server's origin, e.g. `http://192.168.1.20:7766`. */
  readonly server: string;
  readonly token: string;
}

/** The last server address, checked again to be on the local network. */
export const loadServerAddress = async (): Promise<string | null> => {
  const saved = await getItemAsync(SERVER_KEY);
  const address = saved === null ? null : serverFromAddress(saved);

  return address !== null && "server" in address ? address.server : null;
};

/** The paired server, or null when this phone isn't paired. */
export const loadSavedServer = async (): Promise<SavedServer | null> => {
  const [server, token] = await Promise.all([
    loadServerAddress(),
    getItemAsync(TOKEN_KEY),
  ]);

  return server === null || token === null ? null : { server, token };
};

export const saveServer = async ({ server, token }: SavedServer) => {
  await Promise.all([
    setItemAsync(SERVER_KEY, server),
    setItemAsync(TOKEN_KEY, token),
  ]);
};

/** Forgets the token and keeps the address for pairing again. */
export const forgetToken = async () => {
  await deleteItemAsync(TOKEN_KEY);
};
