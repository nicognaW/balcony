import { createSessionList } from "@balcony/client";
import type { SessionListView } from "@balcony/client";
import type { Session } from "@balcony/contracts";
import { useEffect, useMemo, useState } from "react";

// One model for the page, as T3 Code keeps its inbox tracker, so the Working
// grace survives the list unmounting (opening a session and coming back).
const sessionList = createSessionList();

/**
 * The session list's sections and rows for the latest sessions, received at
 * `receivedAt` (epoch ms). It updates again by itself when a Working grace
 * ends.
 */
export const useSessionList = (
  sessions: readonly Session[],
  receivedAt: number
): SessionListView => {
  // The last grace end the list was updated for.
  const [graceEndedAt, setGraceEndedAt] = useState(0);

  // Updating again with the same sessions and time gives the same view, so
  // rendering twice (Strict Mode) is harmless.
  const { nextChangeAt, view } = useMemo(
    () => sessionList.update(sessions, Math.max(receivedAt, graceEndedAt)),
    [sessions, receivedAt, graceEndedAt]
  );

  useEffect(() => {
    if (nextChangeAt === null) {
      return;
    }

    const timer = setTimeout(
      () => setGraceEndedAt(nextChangeAt),
      Math.max(0, nextChangeAt - Date.now())
    );

    return () => clearTimeout(timer);
  }, [nextChangeAt]);

  return view;
};
