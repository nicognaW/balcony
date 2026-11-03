// The paired app: the session list with Transcripts pushed over it (a
// native stack, as in T3 Code). The playground runs the same navigator.
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import type { InitialState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View, useColorScheme } from "react-native";

import { ConnectionPill } from "./components/connection-pill.tsx";
import type { StackParams } from "./navigation.ts";
import { SessionsScreen } from "./screens/sessions-screen.tsx";
import { TranscriptScreen } from "./screens/transcript-screen.tsx";

const Stack = createNativeStackNavigator<StackParams>();

/**
 * The session's title over its project. Given them as props: the header
 * renders outside the screen's route context.
 */
const TranscriptTitle = ({
  params,
}: {
  readonly params: StackParams["Transcript"];
}) => (
  <View className="min-w-0 flex-1">
    <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
      {params.title}
    </Text>
    <Text className="text-muted-foreground text-xs" numberOfLines={1}>
      {params.project}
    </Text>
  </View>
);

export const PairedApp = ({
  initialState,
}: {
  /** The screens to open on; the list by default. */
  readonly initialState?: InitialState;
}) => {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer initialState={initialState} theme={theme}>
      <Stack.Navigator>
        <Stack.Screen
          component={SessionsScreen}
          name="Sessions"
          options={{ headerRight: ConnectionPill, title: "Balcony" }}
        />
        <Stack.Screen
          component={TranscriptScreen}
          name="Transcript"
          options={({ route }) => ({
            // oxlint-disable-next-line react/no-unstable-nested-components -- the header renders outside the route's context, so it gets the params here.
            headerTitle: () => <TranscriptTitle params={route.params} />,
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
