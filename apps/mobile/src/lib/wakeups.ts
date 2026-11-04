// What wakes the connection on Android: the app coming back to the
// foreground, and the network changing. Each tells the connection to
// reconnect now (or check its socket) instead of waiting out the retry.
import type { Connection } from "@balcony/client";
import { addNetworkStateListener } from "expo-network";
import { useEffect } from "react";
import { AppState } from "react-native";

export const useConnectionWakeups = (connection: Connection | null) => {
  useEffect(() => {
    if (connection === null) {
      return;
    }

    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        connection.wake();
      }
    });

    const network = addNetworkStateListener((event) => {
      if (event.isConnected !== false) {
        connection.wake();
      }
    });

    return () => {
      foreground.remove();
      network.remove();
    };
  }, [connection]);
};
