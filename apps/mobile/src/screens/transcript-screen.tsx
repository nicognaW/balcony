// A session's Transcript, full screen. It opens on the newest entries, pages
// back with "Load earlier" and follows new entries live. The list is
// inverted, so it starts at the bottom and keeps the reader's place when
// entries arrive. Sessions are View-only, so there is no message box.
import { formatWorkingDuration } from "@balcony/client";
import {
  useMarkViewed,
  useNow,
  usePaired,
  useSession,
  useTranscript,
  useUnpairWhenRefused,
} from "@balcony/client/react";
import { spaceAbove } from "@balcony/client/transcript";
import { CircleDashedIcon } from "lucide-react-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { Icon } from "../components/icon.tsx";
import { FadeIn, Spin } from "../components/motion.tsx";
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

const Elapsed = ({ since }: { readonly since: number }) => {
  const now = useNow(1000);

  return <Text>{` · ${formatWorkingDuration(now - since)}`}</Text>;
};

/**
 * The quiet line under the last entry while the agent is in a turn, with
 * the list's spinner and how long the turn has run. Not a control.
 */
const WorkingLine = ({ since }: { readonly since: string | null }) => {
  const started = since === null ? Number.NaN : Date.parse(since);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      className="mt-4 flex-row items-center gap-2"
    >
      <View className="size-6 items-center justify-center">
        <Spin>
          <Icon icon={CircleDashedIcon} size={14} tone="info-foreground" />
        </Spin>
      </View>
      <Text className="text-muted-foreground text-sm tabular-nums">
        Working
        {Number.isFinite(started) ? <Elapsed since={started} /> : null}
      </Text>
    </View>
  );
};

/**
 * The session's whole title and project, under the header that cuts them to
 * one line. Tapping it hides it again.
 */
const FullTitle = ({
  onHide,
  project,
  title,
}: {
  readonly onHide: () => void;
  readonly project: string;
  readonly title: string;
}) => (
  <Pressable
    accessibilityHint="Hides the whole title"
    className="border-border bg-card gap-0.5 border-b px-4 py-3"
    onPress={onHide}
  >
    <Text className="text-foreground text-base font-semibold">{title}</Text>
    <Text className="text-muted-foreground text-xs">{project}</Text>
  </Pressable>
);

const TranscriptBody = ({ sessionId }: { readonly sessionId: string }) => {
  const { connection, orpc } = usePaired();
  useMarkViewed(connection.client, sessionId);

  const {
    arrivedLive,
    error,
    loadEarlier,
    loadingEarlier,
    notFound,
    transcript,
  } = useTranscript(orpc, sessionId);

  const session = useSession(orpc, sessionId);
  const working = session?.status === "working";

  useUnpairWhenRefused(error);

  if (transcript === undefined) {
    return (
      <Message>
        {notFound ? "This session has no Transcript." : "Loading Transcript…"}
      </Message>
    );
  }

  const { entries } = transcript;

  if (entries.length === 0 && !working) {
    return <Message>Nothing here yet.</Message>;
  }

  return (
    <FlatList
      // Inverted: the header sits under the newest entry.
      ListHeaderComponent={
        working ? <WorkingLine since={session.turnStartedAt} /> : undefined
      }
      ListFooterComponent={
        transcript.hasEarlier ? (
          <LoadEarlier loading={loadingEarlier} onLoad={loadEarlier} />
        ) : undefined
      }
      contentContainerClassName="px-4 pt-6 pb-2"
      data={[...entries].reverse()}
      inverted
      keyExtractor={(entry) => entry.id}
      renderItem={({ index, item }) => (
        // Reversed: the entry before this one is at index + 1.
        <View
          className={
            SPACE_ABOVE[spaceAbove(entries[entries.length - index - 2], item)]
          }
        >
          <FadeIn animate={arrivedLive.has(item.id)}>
            <TranscriptEntryRow entry={item} />
          </FadeIn>
        </View>
      )}
    />
  );
};

export const TranscriptScreen = ({
  navigation,
  route,
}: ScreenProps<"Transcript">) => {
  const { project, sessionId, title, titleShown } = route.params;

  return (
    <View className="flex-1">
      {titleShown === true ? (
        <FullTitle
          onHide={() => navigation.setParams({ titleShown: false })}
          project={project}
          title={title}
        />
      ) : null}
      <TranscriptBody sessionId={sessionId} />
    </View>
  );
};
