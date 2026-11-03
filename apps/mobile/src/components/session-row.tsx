// A session in the list, laid out like T3 Code's row: project and status or
// time, then the title, then the branch. Adapted from T3 Code (MIT, (c) 2026
// T3 Tools Inc., apps/mobile/src/features/threads/thread-list-v2-items.tsx).
import { formatRelativeTime, formatWorkingDuration } from "@balcony/client";
import type { RowMark, SessionRow as Row } from "@balcony/client";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  GitBranchIcon,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useNow } from "../hooks/use-now.ts";
import { Icon } from "./icon.tsx";

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
          <Icon icon={CircleDashedIcon} size={14} tone="info-foreground" />
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
  row,
}: {
  readonly onPress: () => void;
  readonly row: Row;
}) => (
  <Pressable
    accessibilityHint="Opens the Transcript"
    accessibilityRole="button"
    className="bg-card border-border active:bg-accent h-[78px] rounded-xl border px-3 py-2"
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
    {row.branch === null ? null : (
      <View className="mt-0.5 flex-row items-center gap-1">
        <Icon icon={GitBranchIcon} size={12} />
        <Text
          className="text-muted-foreground min-w-0 flex-1 text-xs"
          numberOfLines={1}
        >
          {row.branch}
        </Text>
      </View>
    )}
  </Pressable>
);
