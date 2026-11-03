// A session's Transcript, full screen. It opens on the newest entries, pages
// back with "Load earlier" and follows new entries live. Sessions are
// View-only, so there is no message box.
import { isUnauthorized } from "@balcony/client";
import { useMarkViewed } from "@balcony/client/react";
import {
  earliestId,
  joinTranscript,
  liveTranscript,
} from "@balcony/client/transcript";
import type { TranscriptEntry } from "@balcony/contracts";
import { ORPCError } from "@orpc/client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { TranscriptEntryRow } from "@/components/transcript/transcript-entry.tsx";
import { usePaired } from "@/hooks/use-paired.ts";

/** How close to the bottom (px) still counts as following the Transcript. */
const FOLLOW_SLACK = 80;

const isStep = (entry: TranscriptEntry) =>
  entry.kind !== "user-message" && entry.kind !== "agent-text";

/** Steps in a row sit close together; anything else gets room above. */
const gapAbove = (
  previous: TranscriptEntry | undefined,
  entry: TranscriptEntry
) => {
  if (previous === undefined) {
    return;
  }

  return isStep(previous) && isStep(entry) ? "mt-0.5" : "mt-4";
};

const distanceFromBottom = () =>
  document.documentElement.scrollHeight - window.innerHeight - window.scrollY;

const LoadEarlier = ({
  loading,
  onLoad,
}: {
  readonly loading: boolean;
  readonly onLoad: () => void;
}) => (
  // Adapted from T3 Code's TimelineHistoryControl (MIT, (c) 2026 T3 Tools Inc.).
  <button
    className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-3 py-1.5 text-xs disabled:cursor-default"
    disabled={loading}
    onClick={onLoad}
    type="button"
  >
    <span aria-hidden="true" className="bg-border/70 h-px flex-1" />
    <span className="shrink-0">
      {loading ? "Loading earlier…" : "Load earlier"}
    </span>
    <span aria-hidden="true" className="bg-border/70 h-px flex-1" />
  </button>
);

const Message = ({ children }: { readonly children: string }) => (
  <p className="text-muted-foreground px-4 py-8 text-center text-sm">
    {children}
  </p>
);

const TranscriptScreen = () => {
  const { sessionId } = useParams({ from: "/s/$sessionId" });
  const { connection, orpc, unpair } = usePaired();
  // Opening the session clears Done on every client.
  useMarkViewed(connection.client, sessionId);

  const watch = useQuery(
    orpc.transcript.watch.streamedOptions({
      input: { sessionId },
      // A resubscribe (after a reconnect) starts again from the newest page.
      queryFnOptions: { refetchMode: "reset" },
    })
  );

  const live = liveTranscript(watch.data ?? []);

  // Unset until "Load earlier" is first pressed: the oldest live entry then.
  const [anchor, setAnchor] = useState<string>();

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
      : joinTranscript(live, earlier.data?.pages ?? []);

  const error = watch.error ?? earlier.error;

  useEffect(() => {
    if (isUnauthorized(error)) {
      unpair();
    }
  }, [error, unpair]);

  // Follow new entries while the reader is at the bottom; keep the reader's
  // place when earlier entries are added above.
  const following = useRef(true);
  const keepFromBottom = useRef<number>(undefined);

  useEffect(() => {
    const onScroll = () => {
      following.current = distanceFromBottom() <= FOLLOW_SLACK;
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const firstId = transcript?.entries[0]?.id;
  const lastId = transcript?.entries.at(-1)?.id;

  useLayoutEffect(() => {
    const kept = keepFromBottom.current;

    // Runs when entries were added above the first one.
    if (kept !== undefined && firstId !== undefined) {
      keepFromBottom.current = undefined;
      window.scrollTo({
        top: document.documentElement.scrollHeight - window.innerHeight - kept,
      });
    }
  }, [firstId]);

  useLayoutEffect(() => {
    if (following.current && lastId !== undefined) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [lastId]);

  if (transcript === undefined) {
    // Kept retrying (the session may yet appear), so its reason, not error.
    const reason = watch.failureReason;

    if (reason instanceof ORPCError && reason.code === "NOT_FOUND") {
      return <Message>This session has no Transcript.</Message>;
    }

    return <Message>Loading Transcript…</Message>;
  }

  const loadEarlier = () => {
    keepFromBottom.current = distanceFromBottom();

    if (anchor === undefined) {
      setAnchor(earliestId(transcript));
    } else {
      void earlier.fetchNextPage();
    }
  };

  return (
    <main className="flex flex-col px-4 pt-2 pb-8">
      {transcript.hasEarlier ? (
        <LoadEarlier loading={earlier.isFetching} onLoad={loadEarlier} />
      ) : null}
      {transcript.entries.length === 0 ? (
        <Message>Nothing here yet.</Message>
      ) : null}
      {transcript.entries.map((entry, index) => {
        const previous = transcript.entries[index - 1];

        return (
          <div className={gapAbove(previous, entry)} key={entry.id}>
            <TranscriptEntryRow entry={entry} />
          </div>
        );
      })}
    </main>
  );
};

export const Route = createFileRoute("/s/$sessionId")({
  component: TranscriptScreen,
});
