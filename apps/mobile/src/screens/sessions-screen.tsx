// The session list, live: Working on top, then the rest in T3 Code's inbox
// order, then Settled (collapsed), from the shared client view model.
import { settledPage } from "@balcony/client";
import type { SessionRow as Row } from "@balcony/client";
import {
  usePaired,
  useSessionList,
  useUnpairWhenRefused,
} from "@balcony/client/react";
import type { Session } from "@balcony/contracts";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Icon } from "../components/icon.tsx";
import { SessionRow } from "../components/session-row.tsx";
import type { ScreenProps } from "../navigation.ts";

type Item =
  | { readonly kind: "header"; readonly label: string; readonly count: number }
  | { readonly kind: "settled"; readonly count: number }
  | { readonly kind: "row"; readonly row: Row }
  | { readonly kind: "more"; readonly hidden: number };

const keyOf = (item: Item): string =>
  item.kind === "row" ? item.row.id : item.kind;

const Message = ({ children }: { readonly children: string }) => (
  <Text className="text-muted-foreground px-4 py-8 text-center text-sm">
    {children}
  </Text>
);

const Footer = () => {
  const { server, unpair } = usePaired();

  return (
    <View className="items-center gap-1 py-6">
      <Text className="text-muted-foreground text-xs">{server}</Text>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => unpair("asked")}
      >
        <Text className="text-primary text-xs">Pair again</Text>
      </Pressable>
    </View>
  );
};

/** The Settled section's header: collapsed until pressed, like T3 Code's. */
const SettledToggle = ({
  count,
  onPress,
  open,
}: {
  readonly count: number;
  readonly onPress: () => void;
  readonly open: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ expanded: open }}
    className="mt-2 flex-row items-center gap-1.5 px-1 py-1"
    onPress={onPress}
  >
    <Icon icon={open ? ChevronDownIcon : ChevronRightIcon} size={14} />
    <Text className="text-muted-foreground text-xs font-medium">
      {`Settled  ${String(count)}`}
    </Text>
  </Pressable>
);

const Sections = ({
  navigation,
  receivedAt,
  sessions,
}: {
  readonly navigation: ScreenProps<"Sessions">["navigation"];
  readonly receivedAt: number;
  readonly sessions: readonly Session[];
}) => {
  const { main, settled, working } = useSessionList(sessions, receivedAt);
  const [settledOpen, setSettledOpen] = useState(false);
  const [more, setMore] = useState(0);
  const settledShown = settledPage(settled, more);

  const items: Item[] = [
    ...(working.length > 0
      ? [{ count: working.length, kind: "header", label: "Working" } as const]
      : []),
    ...working.map((row) => ({ kind: "row", row }) as const),
    ...main.map((row) => ({ kind: "row", row }) as const),
    ...(settled.length > 0
      ? [{ count: settled.length, kind: "settled" } as const]
      : []),
    ...(settledOpen
      ? [
          ...settledShown.rows.map((row) => ({ kind: "row", row }) as const),
          ...(settledShown.hidden > 0
            ? [{ hidden: settledShown.hidden, kind: "more" } as const]
            : []),
        ]
      : []),
  ];

  const renderItem = ({ item }: { readonly item: Item }) => {
    switch (item.kind) {
      case "header": {
        return (
          <Text className="text-muted-foreground mt-2 px-1 text-xs font-medium">
            {`${item.label}  ${String(item.count)}`}
          </Text>
        );
      }

      case "settled": {
        return (
          <SettledToggle
            count={item.count}
            onPress={() => setSettledOpen(!settledOpen)}
            open={settledOpen}
          />
        );
      }

      case "more": {
        return (
          <Pressable
            accessibilityRole="button"
            className="px-1 py-1.5"
            onPress={() => setMore(more + 1)}
          >
            <Text className="text-muted-foreground text-xs font-medium">
              {`Show more (${String(item.hidden)} settled hidden)`}
            </Text>
          </Pressable>
        );
      }

      default: {
        return (
          <SessionRow
            onPress={() =>
              navigation.navigate("Transcript", {
                project: item.row.project,
                sessionId: item.row.id,
                title: item.row.title,
              })
            }
            row={item.row}
          />
        );
      }
    }
  };

  return (
    <FlatList
      ListFooterComponent={Footer}
      contentContainerClassName="gap-2 px-3 pt-2"
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      keyExtractor={keyOf}
      renderItem={renderItem}
    />
  );
};

export const SessionsScreen = ({ navigation }: ScreenProps<"Sessions">) => {
  const { orpc } = usePaired();

  const { data, dataUpdatedAt, error } = useQuery(
    orpc.sessions.watch.liveOptions()
  );

  useUnpairWhenRefused(error);

  if (data === undefined) {
    return <Message>Loading sessions…</Message>;
  }

  if (data.sessions.length === 0) {
    return (
      <View>
        <Message>No Claude sessions in the last 24 hours.</Message>
        <Footer />
      </View>
    );
  }

  return (
    <Sections
      navigation={navigation}
      receivedAt={dataUpdatedAt}
      sessions={data.sessions}
    />
  );
};
