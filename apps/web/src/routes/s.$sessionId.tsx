// A session's Transcript, full screen. It opens on the newest entries, pages
// back with "Load earlier" and follows new entries live. Sessions are
// View-only, so there is no message box.
import {
  useMarkViewed,
  usePaired,
  useTranscript,
  useUnpairWhenRefused,
} from "@balcony/client/react";
import { spaceAbove } from "@balcony/client/transcript";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef } from "react";

import { TranscriptEntryRow } from "@/components/transcript/transcript-entry.tsx";

/** The class for each `spaceAbove`. */
const SPACE_ABOVE = { loose: "mt-4", none: "", tight: "mt-0.5" } as const;

/** How close to the bottom (px) still counts as following the Transcript. */
const FOLLOW_SLACK = 80;

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
  const { connection, orpc } = usePaired();
  // Opening the session clears Done on every client.
  useMarkViewed(connection.client, sessionId);

  const { error, loadEarlier, loadingEarlier, notFound, transcript } =
    useTranscript(orpc, sessionId);

  useUnpairWhenRefused(error);

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
    return (
      <Message>
        {notFound ? "This session has no Transcript." : "Loading Transcript…"}
      </Message>
    );
  }

  const onLoadEarlier = () => {
    keepFromBottom.current = distanceFromBottom();
    loadEarlier();
  };

  return (
    <main className="flex flex-col px-4 pt-2 pb-8">
      {transcript.hasEarlier ? (
        <LoadEarlier loading={loadingEarlier} onLoad={onLoadEarlier} />
      ) : null}
      {transcript.entries.length === 0 ? (
        <Message>Nothing here yet.</Message>
      ) : null}
      {transcript.entries.map((entry, index) => {
        const previous = transcript.entries[index - 1];

        return (
          <div
            className={SPACE_ABOVE[spaceAbove(previous, entry)]}
            key={entry.id}
          >
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
