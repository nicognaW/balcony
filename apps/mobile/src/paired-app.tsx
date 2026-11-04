// The paired app: the session list with Transcripts pushed over it (a
// native stack, as in T3 Code). The playground runs the same navigator.
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import type { InitialState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, Text, useColorScheme } from "react-native";

import { ConnectionPill } from "./components/connection-pill.tsx";
import type { StackParams } from "./navigation.ts";
import { SessionsScreen } from "./screens/sessions-screen.tsx";
import {
  TranscriptScreen,
  useTranscriptHeading,
} from "./screens/transcript-screen.tsx";

const Stack = createNativeStackNavigator<StackParams>();

/**
 * The session's title over its project, on one line each; tapping it shows
 * the whole title under the header, as the header can't grow. Given the
 * params as props: the header renders outside the screen's route context.
 */
const TranscriptTitle = ({
  onPress,
  params,
}: {
  readonly onPress: () => void;
  readonly params: StackParams["Transcript"];
}) => {
  const { project, title } = useTranscriptHeading(params);

  return (
    <Pressable
      accessibilityHint={
        params.titleShown === true
          ? "Hides the whole title"
          : "Shows the whole title"
      }
      accessibilityRole="button"
      accessibilityState={{ expanded: params.titleShown === true }}
      className="min-w-0 flex-1"
      onPress={onPress}
    >
      <Text
        className="text-foreground text-base font-semibold"
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
        {project}
      </Text>
    </Pressable>
  );
};

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
          options={({ navigation, route }) => ({
            // oxlint-disable-next-line react/no-unstable-nested-components -- the header renders outside the route's context, so it gets the params here.
            headerTitle: () => (
              <TranscriptTitle
                onPress={() =>
                  navigation.setParams({
                    titleShown: route.params.titleShown !== true,
                  })
                }
                params={route.params}
              />
            ),
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
