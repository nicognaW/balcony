// A session's Transcript, full screen. It opens on the newest entries, pages
// back with "Load earlier" and follows new entries live. The list is
// inverted, so it starts at the bottom and keeps the reader's place when
// entries arrive. Sessions are View-only, so there is no message box.
import {
  earliestId,
  joinTranscript,
  liveTranscript,
} from "@balcony/client/transcript";
import type { TranscriptEntry } from "@balcony/contracts";
import { ORPCError } from "@orpc/client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { TranscriptEntryRow } from "../components/transcript-entry.tsx";
import { usePaired } from "../hooks/use-paired.ts";
import { useMarkViewed } from "../hooks/use-session-marks.ts";
import { isUnauthorized } from "../lib/connection.ts";
import type { ScreenProps } from "../navigation.ts";

const isStep = (entry: TranscriptEntry) =>
  entry.kind !== "user-message" && entry.kind !== "agent-text";

/** Steps in a row sit close together; anything else gets room above. */
const gapAbove = (
  previous: TranscriptEntry | undefined,
  entry: TranscriptEntry
) => {
  if (previous === undefined) {
    return "";
  }

  return isStep(previous) && isStep(entry) ? "mt-0.5" : "mt-4";
};

const Message = ({ children }: { readonly children: string }) => (
  <Text className="text-muted-foreground px-4 py-8 text-center text-sm">
    {children}
  </Text>
);

const LoadEarlier = ({
  loading,
  onLoad,
}: {
  readonly loading: boolean;
  readonly onLoad: () => void;
}) => (
  // Adapted from T3 Code's TimelineHistoryControl (MIT, (c) 2026 T3 Tools Inc.).
  <Pressable
    accessibilityRole="button"
    className="flex-row items-center gap-3 py-3"
    disabled={loading}
    onPress={onLoad}
  >
    <View className="border-border flex-1 border-t" />
    <Text className="text-muted-foreground text-xs">
      {loading ? "Loading earlier…" : "Load earlier"}
    </Text>
    <View className="border-border flex-1 border-t" />
  </Pressable>
);

export const TranscriptScreen = ({ route }: ScreenProps<"Transcript">) => {
  const { sessionId } = route.params;
  const { orpc, unpair } = usePaired();
  useMarkViewed(sessionId);

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
      unpair("refused");
    }
  }, [error, unpair]);

  if (transcript === undefined) {
    // Kept retrying (the session may yet appear), so its reason, not error.
    const reason = watch.failureReason;

    if (reason instanceof ORPCError && reason.code === "NOT_FOUND") {
      return <Message>This session has no Transcript.</Message>;
    }

    return <Message>Loading Transcript…</Message>;
  }

  const { entries } = transcript;

  if (entries.length === 0) {
    return <Message>Nothing here yet.</Message>;
  }

  const loadEarlier = () => {
    if (anchor === undefined) {
      setAnchor(earliestId(transcript));
    } else {
      void earlier.fetchNextPage();
    }
  };

  return (
    <FlatList
      ListFooterComponent={
        transcript.hasEarlier ? (
          <LoadEarlier loading={earlier.isFetching} onLoad={loadEarlier} />
        ) : undefined
      }
      contentContainerClassName="px-4 pt-6 pb-2"
      data={entries.toReversed()}
      inverted
      keyExtractor={(entry) => entry.id}
      renderItem={({ index, item }) => (
        // Reversed: the entry before this one is at index + 1.
        <View className={gapAbove(entries[entries.length - index - 2], item)}>
          <TranscriptEntryRow entry={item} />
        </View>
      )}
    />
  );
};
