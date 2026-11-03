// Changing what the user has seen and dealt with. The server shares every
// change through `sessions.watch`, so the list updates on every client.
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

import { usePaired } from "@/hooks/use-paired.ts";

/** Settles (`settled: true`) or un-settles a session. */
export const useSettle = () => {
  const { connection } = usePaired();

  return useMutation({
    mutationFn: ({ id, settled }: { id: string; settled: boolean }) =>
      settled
        ? connection.client.sessions.settle({ id })
        : connection.client.sessions.unsettle({ id }),
  });
};

/**
 * Marks the session viewed when it opens and again when it closes, so a turn
 * the user watched finish never shows as Done. For the transcript route.
 */
export const useMarkViewed = (id: string) => {
  const { connection } = usePaired();

  useEffect(() => {
    const mark = () => {
      connection.client.sessions.markViewed({ id }).catch(() => {
        // Offline: the next open marks it again.
      });
    };

    mark();

    return mark;
  }, [connection, id]);
};
