// The playground: every screen against built-in fake data, with no Balcony
// server. Shared by the apps; React-free.
export { createPlayground } from "./fake-server.ts";

export type { Playground, PlaygroundOptions } from "./fake-server.ts";

export { parsePlaygroundLink, PLAYGROUND_SCREENS } from "./link.ts";

export type {
  PlaygroundLink,
  PlaygroundScreen,
  PlaygroundSwipe,
} from "./link.ts";

export { PLAYGROUND_SERVER, scenarioOf, scenarios } from "./scenarios.ts";

export type {
  FakePairing,
  PlaygroundConnectionState,
  Scenario,
  ScenarioData,
  ScenarioId,
} from "./scenarios.ts";
