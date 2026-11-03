import type { ConnectionState } from "@balcony/client";
import { use, useSyncExternalStore } from "react";

import { PairedContext } from "../lib/connection.ts";
import type { Paired } from "../lib/connection.ts";

export const usePaired = (): Paired => {
  const paired = use(PairedContext);

  if (paired === null) {
    throw new Error("usePaired needs a paired BalconyProvider");
  }

  return paired;
};

export const useConnectionState = (): ConnectionState => {
  const { connection } = usePaired();

  return useSyncExternalStore(connection.subscribe, connection.getState);
};
