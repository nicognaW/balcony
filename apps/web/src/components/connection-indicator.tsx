// Adapted from T3 Code's ConnectionStatusDot (MIT, (c) 2026 T3 Tools Inc.).
import type { ConnectionState } from "@balcony/client";
import { useConnectionState, usePaired } from "@balcony/client/react";

import { cn } from "@/lib/utils";

const LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
};

/** A dot and label for the connection; amber and pulsing while it's down. */
export const ConnectionIndicator = () => {
  const state = useConnectionState(usePaired().connection);
  const connected = state === "connected";

  return (
    <output
      aria-live="polite"
      className="text-muted-foreground flex items-center gap-2 text-xs"
    >
      <span className="relative flex size-3 shrink-0 items-center justify-center">
        {connected ? null : (
          <span className="bg-warning/60 motion-safe:animate-status-ping absolute inline-flex size-full rounded-full" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            connected ? "bg-success" : "bg-warning"
          )}
        />
      </span>
      {LABELS[state]}
    </output>
  );
};
