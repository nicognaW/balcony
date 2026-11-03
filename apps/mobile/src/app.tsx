import { PairedContext, connectTo } from "@balcony/client/react";
import type { Paired, PairedConnection } from "@balcony/client/react";
// The app: the pairing screen until this phone is paired, then the session
// list with Transcripts pushed over it (a native stack, as in T3 Code).
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useRoute,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Text, View, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ConnectionPill } from "./components/connection-pill.tsx";
import { queryClient } from "./lib/connection.ts";
import {
  forgetToken,
  loadSavedServer,
  loadServerAddress,
} from "./lib/saved-server.ts";
import type { StackParams } from "./navigation.ts";
import { PairScreen } from "./screens/pair-screen.tsx";
import { SessionsScreen } from "./screens/sessions-screen.tsx";
import { TranscriptScreen } from "./screens/transcript-screen.tsx";

const Stack = createNativeStackNavigator<StackParams>();

/** The session's title over its project. */
const TranscriptTitle = () => {
  const { params } = useRoute<RouteProp<StackParams, "Transcript">>();

  return (
    <View className="min-w-0 flex-1">
      <Text
        className="text-foreground text-base font-semibold"
        numberOfLines={1}
      >
        {params.title}
      </Text>
      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
        {params.project}
      </Text>
    </View>
  );
};

const PairedApp = () => {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator>
        <Stack.Screen
          component={SessionsScreen}
          name="Sessions"
          options={{ headerRight: ConnectionPill, title: "Balcony" }}
        />
        <Stack.Screen
          component={TranscriptScreen}
          name="Transcript"
          options={{ headerTitle: TranscriptTitle }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

type Startup =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly paired: PairedConnection | null;
      readonly lastServer: string | null;
    };

const App = () => {
  const [startup, setStartup] = useState<Startup>({ kind: "loading" });
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    void Promise.all([loadSavedServer(), loadServerAddress()]).then(
      ([saved, lastServer]) =>
        setStartup({
          kind: "ready",
          lastServer,
          paired: saved === null ? null : connectTo(saved),
        })
    );
  }, []);

  const paired = startup.kind === "ready" ? startup.paired : null;

  const value = useMemo(
    (): Paired | null =>
      paired === null
        ? null
        : {
            ...paired,
            unpair: (reason) => {
              paired.connection.close();
              void forgetToken();
              queryClient.clear();
              setRefused(reason === "refused");
              setStartup({
                kind: "ready",
                lastServer: paired.server,
                paired: null,
              });
            },
          },
    [paired]
  );

  if (startup.kind === "loading") {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar />
      {value === null ? (
        <PairScreen
          lastServer={startup.lastServer}
          onPaired={(next) => {
            setRefused(false);
            setStartup({
              kind: "ready",
              lastServer: next.server,
              paired: next,
            });
          }}
          refused={refused}
        />
      ) : (
        <QueryClientProvider client={queryClient}>
          <PairedContext value={value}>
            <PairedApp />
          </PairedContext>
        </QueryClientProvider>
      )}
    </SafeAreaProvider>
  );
};

export default App;
