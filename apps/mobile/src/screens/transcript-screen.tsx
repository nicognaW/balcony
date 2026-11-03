// A session's Transcript, full screen. It opens on the newest entries, pages
// back with "Load earlier" and follows new entries live. The list is
// inverted, so it starts at the bottom and keeps the reader's place when
// entries arrive. Sessions are View-only, so there is no message box.
import {
  useMarkViewed,
  usePaired,
  useTranscript,
  useUnpairWhenRefused,
} from "@balcony/client/react";
import { spaceAbove } from "@balcony/client/transcript";
import { FlatList, Pressable, Text, View } from "react-native";

import { TranscriptEntryRow } from "../components/transcript-entry.tsx";
import type { ScreenProps } from "../navigation.ts";

/** The class for each `spaceAbove`. */
const SPACE_ABOVE = { loose: "mt-4", none: "", tight: "mt-0.5" } as const;

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
  const { connection, orpc } = usePaired();
  useMarkViewed(connection.client, sessionId);

  const { error, loadEarlier, loadingEarlier, notFound, transcript } =
    useTranscript(orpc, sessionId);

  useUnpairWhenRefused(error);

  if (transcript === undefined) {
    return (
      <Message>
        {notFound ? "This session has no Transcript." : "Loading Transcript…"}
      </Message>
    );
  }

  const { entries } = transcript;

  if (entries.length === 0) {
    return <Message>Nothing here yet.</Message>;
  }

  return (
    <FlatList
      ListFooterComponent={
        transcript.hasEarlier ? (
          <LoadEarlier loading={loadingEarlier} onLoad={loadEarlier} />
        ) : undefined
      }
      contentContainerClassName="px-4 pt-6 pb-2"
      data={entries.toReversed()}
      inverted
      keyExtractor={(entry) => entry.id}
      renderItem={({ index, item }) => (
        // Reversed: the entry before this one is at index + 1.
        <View
          className={
            SPACE_ABOVE[spaceAbove(entries[entries.length - index - 2], item)]
          }
        >
          <TranscriptEntryRow entry={item} />
        </View>
      )}
    />
  );
};
