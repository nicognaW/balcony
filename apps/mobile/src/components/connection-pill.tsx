// Adapted from T3 Code's ConnectionStatusDot (MIT, (c) 2026 T3 Tools Inc.).
import type { ConnectionState } from "@balcony/client";
import { Text, View } from "react-native";

import { useConnectionState } from "../hooks/use-paired.ts";

const LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
};

/** A dot and label for the connection: green when up, amber while down. */
export const ConnectionPill = () => {
  const state = useConnectionState();
  const connected = state === "connected";

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      className="flex-row items-center gap-1.5"
    >
      <View
        className={`size-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`}
      />
      <Text className="text-muted-foreground text-xs">{LABELS[state]}</Text>
    </View>
  );
};
