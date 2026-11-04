// The playground's deep link, for automation (the CI screenshots):
// `balcony://playground?scenario=<id>&screen=<screen>&session=<id>`, and
// `&swipe=<session id>:<points>` to hold that row swiped left partway.
// Parsed by hand: React Native's URL has no working searchParams.
import { scenarios } from "./scenarios.ts";
import type { ScenarioId } from "./scenarios.ts";

/** The screens the playground can open on. */
export const PLAYGROUND_SCREENS = [
  "sessions",
  "transcript",
  "pair",
  "panel",
] as const;

export type PlaygroundScreen = (typeof PLAYGROUND_SCREENS)[number];

export interface PlaygroundLink {
  readonly scenario: ScenarioId;
  readonly screen: PlaygroundScreen;
  /** For `transcript`: the session to open; the scenario's first by default. */
  readonly session: string | undefined;
  /** For `sessions`: a row held swiped `offset` points left, as mid-swipe. */
  readonly swipe: PlaygroundSwipe | undefined;
}

export interface PlaygroundSwipe {
  readonly session: string;
  readonly offset: number;
}

/** `<session id>:<points>`, or undefined when it isn't that. */
const swipeOf = (value: string | undefined): PlaygroundSwipe | undefined => {
  const groups = /^(?<session>.+):(?<offset>\d+)$/u.exec(value ?? "")?.groups;

  return groups?.session === undefined || groups.offset === undefined
    ? undefined
    : { offset: Number(groups.offset), session: groups.session };
};

const PREFIX = "balcony://playground";

/** The playground a deep link opens, or null for any other link. */
export const parsePlaygroundLink = (url: string): PlaygroundLink | null => {
  if (!url.startsWith(PREFIX)) {
    return null;
  }

  const rest = url.slice(PREFIX.length);

  if (rest !== "" && !rest.startsWith("?") && !rest.startsWith("/")) {
    return null;
  }

  const query = new Map(
    (rest.split("?")[1] ?? "")
      .split("&")
      .filter((pair) => pair !== "")
      .map((pair) => {
        const [key = "", value = ""] = pair.split("=");

        return [decodeURIComponent(key), decodeURIComponent(value)] as const;
      })
  );

  const scenario =
    scenarios.find((known) => known.id === query.get("scenario")) ??
    scenarios[0];

  if (scenario === undefined) {
    return null;
  }

  const screen =
    PLAYGROUND_SCREENS.find((known) => known === query.get("screen")) ??
    scenario.screen;

  return {
    scenario: scenario.id,
    screen,
    session: query.get("session"),
    swipe: swipeOf(query.get("swipe")),
  };
};
