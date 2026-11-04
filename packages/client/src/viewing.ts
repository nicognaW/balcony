// Keeping a session open on the server while its Transcript is on screen, so
// turns that end meanwhile never show as Done on another client.
import type { BalconyClient } from "@balcony/contracts";

const ignore = () => {
  // Dropped with the socket, or stopped: `hold` decides which.
};

/**
 * Holds `sessions.view` open for session `id` until the returned function is
 * called, opening it again `retryDelayMs` after it drops (a reconnect). The
 * server marks the session viewed each time it opens and closes.
 */
export const keepViewing = (
  client: BalconyClient,
  id: string,
  retryDelayMs = 1000
): (() => void) => {
  const controller = new AbortController();
  const { signal } = controller;

  /** Holds it open once, until the call ends or is stopped. */
  const holdOnce = async () => {
    const held = await client.sessions.view({ id }, { signal });
    const stop = () => held.return?.()?.catch(ignore);

    if (signal.aborted) {
      await stop();

      return;
    }

    signal.addEventListener("abort", stop, { once: true });

    try {
      // It sends nothing: this settles once the call ends.
      await held.next();
    } finally {
      signal.removeEventListener("abort", stop);
    }
  };

  const hold = async () => {
    await holdOnce().catch(ignore);

    if (!signal.aborted) {
      setTimeout(() => {
        hold().catch(ignore);
      }, retryDelayMs);
    }
  };

  hold().catch(ignore);

  return () => controller.abort();
};
