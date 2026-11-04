// A playground run: one scenario's fake server, query cache and the screens
// it opens on, started from a deep link or the panel.
import { sessionTitle } from "@balcony/client";
import { createPlayground, scenarioOf } from "@balcony/client/playground";
import type {
  Playground,
  PlaygroundLink,
  PlaygroundScreen,
  ScenarioId,
} from "@balcony/client/playground";
import { createQueryClient } from "@balcony/client/react";
import type { InitialState } from "@react-navigation/native";
import type { QueryClient } from "@tanstack/react-query";

/** The screens a link opens on, as the navigator's starting state. */
const navigationFor = (
  opening: PlaygroundLink,
  playground: Playground
): InitialState | undefined => {
  if (opening.screen !== "transcript") {
    return undefined;
  }

  const sessions = playground.getSessions();

  const id =
    opening.session ?? playground.scenario.live?.appendTo ?? sessions[0]?.id;

  const session = sessions.find((known) => known.id === id);

  if (session === undefined) {
    return undefined;
  }

  return {
    index: 1,
    routes: [
      { name: "Sessions" },
      {
        name: "Transcript",
        params: {
          project: session.project,
          sessionId: session.id,
          title: sessionTitle(session),
        },
      },
    ],
  };
};

/** One scenario's run: its fake server, query cache and opening screens. */
export interface PlaygroundRun {
  /** New for every run, to key its screens. */
  readonly id: number;
  readonly playground: Playground;
  readonly queryClient: QueryClient;
  readonly screen: PlaygroundScreen;
  readonly initialState: InitialState | undefined;
}

let runs = 0;

/**
 * Starts a scenario's fake server for a link. Close the run's playground
 * when it is left.
 */
export const startPlayground = (link: PlaygroundLink): PlaygroundRun => {
  const playground = createPlayground({ scenario: link.scenario });
  const queryClient = createQueryClient();
  runs += 1;

  // Every failed call in logcat (ReactNativeJS), for debugging the screens
  // from CI: the screens themselves keep retrying quietly.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "failed") {
      // oxlint-disable-next-line no-console -- the playground's debug log.
      console.warn(
        `[playground] ${JSON.stringify(event.query.queryKey)} failed:`,
        event.action.error
      );
    }
  });

  return {
    id: runs,
    initialState: navigationFor(link, playground),
    playground,
    queryClient,
    screen: link.screen,
  };
};

/** The scenario's own opening screen, for switching to it in the panel. */
export const linkTo = (id: ScenarioId): PlaygroundLink => ({
  scenario: id,
  screen: scenarioOf(id).screen,
  session: undefined,
});
