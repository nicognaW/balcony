// A session in the list, laid out like T3 Code's row: project and status,
// Done or time, then the title, then the branch. Swiped left, it settles
// (or un-settles); screen readers get the same as a row action. Adapted
// from T3 Code (MIT, (c) 2026 T3 Tools Inc.,
// apps/mobile/src/features/threads/thread-list-v2-items.tsx).
import { formatRelativeTime, formatWorkingDuration } from "@balcony/client";
import type { RowMark, SessionRow as Row } from "@balcony/client";
import { useNow } from "@balcony/client/react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  GitBranchIcon,
} from "lucide-react-native";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";

import { Icon } from "./icon.tsx";
import { Spin } from "./motion.tsx";
import { SwipeToSettle } from "./swipe-to-settle.tsx";

const WorkingDuration = ({ since }: { readonly since: number }) => {
  const now = useNow(1000);

  return <Text>{` ${formatWorkingDuration(now - since)}`}</Text>;
};

const RelativeTime = ({ at }: { readonly at: number }) => {
  const now = useNow(30_000);

  return (
    <Text className="text-muted-foreground text-xs tabular-nums">
      {formatRelativeTime(now - at)}
    </Text>
  );
};

/** Working with its elapsed time, Done, or how long ago the session was active. */
const Mark = ({ mark }: { readonly mark: RowMark }) => {
  switch (mark.kind) {
    case "time": {
      return <RelativeTime at={mark.at} />;
    }

    case "done": {
      return (
        <View className="flex-row items-center gap-1">
          <Icon icon={CircleCheckIcon} size={14} tone="success-foreground" />
          <Text className="text-success-foreground text-xs font-medium">
            Done
          </Text>
        </View>
      );
    }

    default: {
      return (
        <View className="flex-row items-center gap-1">
          <Spin>
            <Icon icon={CircleDashedIcon} size={14} tone="info-foreground" />
          </Spin>
          <Text className="text-info-foreground text-xs font-medium tabular-nums">
            Working
            {mark.since === null ? null : (
              <WorkingDuration since={mark.since} />
            )}
          </Text>
        </View>
      );
    }
  }
};

export const SessionRow = ({
  onPress,
  onSettle,
  row,
}: {
  readonly onPress: () => void;
  /** Settles the row, or un-settles it when it is Settled. */
  readonly onSettle: () => Promise<void>;
  readonly row: Row;
}) => {
  const settled = row.session.settledAt !== null;

  return (
    // Keyed by its side: a row that has just been settled or un-settled
    // starts afresh, at home.
    <SwipeToSettle
      id={row.id}
      key={String(settled)}
      onSettle={onSettle}
      settled={settled}
    >
      <Pressable
        accessibilityActions={[
          { label: settled ? "Un-settle" : "Settle", name: "settle" },
        ]}
        accessibilityHint="Opens the Transcript"
        accessibilityRole="button"
        className="bg-card border-border active:bg-accent min-h-[78px] rounded-xl border px-3 py-2"
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "settle") {
            void onSettle().catch(() =>
              AccessibilityInfo.announceForAccessibility(
                `Couldn't ${settled ? "un-settle" : "settle"}. Try again.`
              )
            );
          }
        }}
        onPress={onPress}
      >
        <View className="flex-row items-center gap-1.5">
          <Text
            className="text-muted-foreground min-w-0 flex-1 text-xs"
            numberOfLines={1}
          >
            {row.project}
          </Text>
          <Mark mark={row.mark} />
        </View>
        <Text className="text-foreground mt-1 text-sm" numberOfLines={1}>
          {row.title}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1">
          {row.branch === null ? null : <Icon icon={GitBranchIcon} size={12} />}
          <Text
            className="text-muted-foreground min-w-0 flex-1 text-xs"
            numberOfLines={1}
          >
            {row.branch ?? ""}
          </Text>
        </View>
      </Pressable>
    </SwipeToSettle>
  );
};
