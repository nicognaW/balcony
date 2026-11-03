// React hooks over the shared client, used alike by the web app and the
// Android app. React and TanStack Query are peers: each app brings its own.
import type { BalconyClient, Session } from "@balcony/contracts";
import { ORPCError } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { createSessionList, isUnauthorized } from "./index.ts";
import type { Connection, ConnectionState, SessionListView } from "./index.ts";
import {
  earliestId,
  joinTranscript,
  liveTranscript,
  pagingAnchor,
} from "./transcript.ts";
import type { TranscriptView } from "./transcript.ts";

/** TanStack Query options for every procedure of a connection's client. */
export const orpcOf = (connection: Connection) =>
  createTanstackQueryUtils(connection.client);

export type Orpc = ReturnType<typeof orpcOf>;

/** The query client for live data, the same in both apps. */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Live data only: refetching on focus would restart live streams.
        refetchOnWindowFocus: false,
        // Keep retrying through reconnects, unless the pairing is refused.
        retry: (_count, error) => !isUnauthorized(error),
        retryDelay: 1000,
      },
    },
  });

/** The connection's state, for a connection indicator. */
export const useConnectionState = (connection: Connection): ConnectionState =>
  useSyncExternalStore(connection.subscribe, connection.getState);

/** The current time in epoch ms, refreshed every `intervalMs`. */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
};

// One model for the app, as T3 Code keeps its inbox tracker, so the Working
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

// Changing what the user has seen and dealt with. The server shares every
// change through `sessions.watch`, so the list updates on every client; no
// optimistic patch is needed.

/** Settles (`settled: true`) or un-settles a session. */
export const useSettle = (client: BalconyClient) =>
  useMutation({
    mutationFn: ({ id, settled }: { id: string; settled: boolean }) =>
      settled
        ? client.sessions.settle({ id })
        : client.sessions.unsettle({ id }),
  });

/**
 * Marks the session viewed when its Transcript opens and again when it
 * closes, so a turn the user watched finish never shows as Done.
 */
export const useMarkViewed = (client: BalconyClient, id: string) => {
  useEffect(() => {
    const mark = () => {
      client.sessions.markViewed({ id }).catch(() => {
        // Offline: the next open marks it again.
      });
    };

    mark();

    return mark;
  }, [client, id]);
};

export interface TranscriptState {
  /** Undefined until the newest page arrives. */
  readonly transcript: TranscriptView | undefined;
  /** The server has no Transcript for the session (it keeps retrying). */
  readonly notFound: boolean;
  readonly error: Error | null;
  /** Loads the page before the oldest entry shown. */
  readonly loadEarlier: () => void;
  readonly loadingEarlier: boolean;
}

/**
 * A session's Transcript: the newest page, followed live, and the pages
 * loaded with "Load earlier" before it.
 */
export const useTranscript = (
  orpc: Orpc,
  sessionId: string
): TranscriptState => {
  const watch = useQuery(
    orpc.transcript.watch.streamedOptions({
      input: { sessionId },
      // A resubscribe (after a reconnect) starts again from the newest page.
      queryFnOptions: { refetchMode: "reset" },
    })
  );

  const live = liveTranscript(watch.data ?? []);

  // Unset until "Load earlier" is first pressed: the oldest live entry then.
  const [pressedAt, setPressedAt] = useState<string>();
  // Unset again when a new live tail no longer reaches it.
  const anchor = live === undefined ? undefined : pagingAnchor(live, pressedAt);

  const earlier = useInfiniteQuery(
    orpc.transcript.read.infiniteOptions({
      enabled: anchor !== undefined,
      getNextPageParam: (page) =>
        page.hasEarlier ? page.entries[0]?.id : undefined,
      initialPageParam: anchor ?? "",
      input: (before: string) => ({ before, sessionId }),
      staleTime: Number.POSITIVE_INFINITY,
    })
  );

  const transcript =
    live === undefined
      ? undefined
      : joinTranscript(live, earlier.data?.pages ?? [], anchor);

  // Kept retrying (the session may yet appear), so its reason, not error.
  const reason = watch.failureReason;

  return {
    error: watch.error ?? earlier.error,
    loadEarlier: () => {
      if (live === undefined) {
        return;
      }

      if (anchor === undefined) {
        setPressedAt(earliestId(live));
      } else {
        void earlier.fetchNextPage();
      }
    },
    loadingEarlier: earlier.isFetching,
    notFound: reason instanceof ORPCError && reason.code === "NOT_FOUND",
    transcript,
  };
};
