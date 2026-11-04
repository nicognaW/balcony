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
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  connect,
  createSessionList,
  isUnauthorized,
  redeemPairingCode,
} from "./index.ts";
import type {
  Connection,
  ConnectionState,
  PairingRefused,
  SessionListView,
} from "./index.ts";
import {
  earliestId,
  joinTranscript,
  liveArrivals,
  liveTranscript,
  pagingAnchor,
} from "./transcript.ts";
import type { TranscriptView } from "./transcript.ts";

/** TanStack Query options for every procedure of a connection's client. */
export const orpcOf = (connection: Connection) =>
  createTanstackQueryUtils(connection.client);

export type Orpc = ReturnType<typeof orpcOf>;

/** A connection to the paired server, as the app shares it. */
export interface PairedConnection {
  /** The server's origin, e.g. `http://192.168.1.20:7766`. */
  readonly server: string;
  readonly connection: Connection;
  readonly orpc: Orpc;
}

/** Connects to a server with its pairing token. */
export const connectTo = ({
  server,
  token,
}: {
  readonly server: string;
  readonly token: string;
}): PairedConnection => {
  const connection = connect({ server, token });

  return { connection, orpc: orpcOf(connection), server };
};

/**
 * Exchanges the short code `balcony` shows for the token, has `save` keep
 * it, and connects. Fails only when `save` does.
 */
export const pairWithCode = async ({
  code,
  save,
  server,
}: {
  readonly code: string;
  readonly save: (token: string) => Promise<void> | void;
  readonly server: string;
}): Promise<{ readonly paired: PairedConnection } | PairingRefused> => {
  const result = await redeemPairingCode({ code, server });

  if ("refusal" in result) {
    return result;
  }

  await save(result.token);

  return { paired: connectTo({ server, token: result.token }) };
};

export interface Paired extends PairedConnection {
  /**
   * Closes the connection, forgets the token and returns to pairing:
   * `refused` when the server no longer accepts it, `asked` when the user
   * chose to pair again.
   */
  readonly unpair: (reason: "refused" | "asked") => void;
}

/** The paired connection, null while the app isn't paired. */
export const PairedContext = createContext<Paired | null>(null);

export const usePaired = (): Paired => {
  const paired = use(PairedContext);

  if (paired === null) {
    throw new Error("usePaired needs a paired PairedContext");
  }

  return paired;
};

/** Unpairs when a call's `error` says the server refused the token. */
export const useUnpairWhenRefused = (error: Error | null) => {
  const { unpair } = usePaired();

  useEffect(() => {
    if (isUnauthorized(error)) {
      unpair("refused");
    }
  }, [error, unpair]);
};

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

/**
 * A session from the live session list (shared with the list screen's
 * query), undefined until the list arrives or when it isn't listed.
 */
export const useSession = (orpc: Orpc, id: string): Session | undefined => {
  const { data } = useQuery(orpc.sessions.watch.liveOptions());

  return data?.sessions.find((session) => session.id === id);
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
  /**
   * The entries that just arrived live, for the screen to fade in. Rows
   * read it when they mount; the initial page and earlier pages are never
   * in it.
   */
  readonly arrivedLive: ReadonlySet<string>;
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

  const updates = watch.data;
  const live = useMemo(() => liveTranscript(updates ?? []), [updates]);

  // The updates now and at the render before they last changed: what was
  // on screen then is what doesn't fade in now.
  const [seen, setSeen] = useState<{
    readonly now: typeof updates;
    readonly before: typeof updates;
  }>({ before: undefined, now: undefined });

  if (seen.now !== updates) {
    setSeen({ before: seen.now, now: updates });
  }

  const arrivedLive = useMemo(
    () =>
      liveArrivals(
        updates ?? [],
        seen.before === undefined
          ? undefined
          : new Set(
              seen.before.flatMap((update) =>
                update.entries.map((entry) => entry.id)
              )
            )
      ),
    [updates, seen.before]
  );

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

  const pages = earlier.data?.pages;

  const transcript = useMemo(
    () =>
      live === undefined
        ? undefined
        : joinTranscript(live, pages ?? [], anchor),
    [live, pages, anchor]
  );

  // Kept retrying (the session may yet appear), so its reason, not error.
  const reason = watch.failureReason;

  return {
    arrivedLive,
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
