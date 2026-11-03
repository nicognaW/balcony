// The session list, live: Working on top, then the rest in T3 Code's inbox
// order, from the shared client view model.
import type { SessionRow as Row } from "@balcony/client";
import type { Session } from "@balcony/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { SessionRow } from "../components/session-row.tsx";
import { usePaired } from "../hooks/use-paired.ts";
import { useSessionList } from "../hooks/use-session-list.ts";
import { isUnauthorized } from "../lib/connection.ts";
import type { ScreenProps } from "../navigation.ts";

type Item =
  | { readonly kind: "header"; readonly label: string; readonly count: number }
  | { readonly kind: "row"; readonly row: Row };

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

const Sections = ({
  navigation,
  receivedAt,
  sessions,
}: {
  readonly navigation: ScreenProps<"Sessions">["navigation"];
  readonly receivedAt: number;
  readonly sessions: readonly Session[];
}) => {
  const { main, working } = useSessionList(sessions, receivedAt);

  const items: Item[] = [
    ...(working.length > 0
      ? [{ count: working.length, kind: "header", label: "Working" } as const]
      : []),
    ...working.map((row) => ({ kind: "row", row }) as const),
    ...main.map((row) => ({ kind: "row", row }) as const),
  ];

  return (
    <FlatList
      ListFooterComponent={Footer}
      contentContainerClassName="gap-2 px-3 pt-2"
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      keyExtractor={(item) =>
        item.kind === "row" ? item.row.id : `header-${item.label}`
      }
      renderItem={({ item }) =>
        item.kind === "header" ? (
          <Text className="text-muted-foreground mt-2 px-1 text-xs font-medium">
            {`${item.label}  ${String(item.count)}`}
          </Text>
        ) : (
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
        )
      }
    />
  );
};

export const SessionsScreen = ({ navigation }: ScreenProps<"Sessions">) => {
  const { orpc, unpair } = usePaired();

  const { data, dataUpdatedAt, error } = useQuery(
    orpc.sessions.watch.liveOptions()
  );

  useEffect(() => {
    if (isUnauthorized(error)) {
      unpair("refused");
    }
  }, [error, unpair]);

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
