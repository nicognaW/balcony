// Seam C: the playground's deep link, as automation opens it.
import { describe, expect, it } from "@effect/vitest";

import { parsePlaygroundLink } from "../src/playground/index.ts";

describe("playground link", () => {
  it("opens a scenario on a screen", () => {
    expect(
      parsePlaygroundLink(
        "balcony://playground?scenario=edge-cases&screen=panel"
      )
    ).toEqual({ scenario: "edge-cases", screen: "panel", session: undefined });
  });

  it("opens a session's Transcript", () => {
    expect(
      parsePlaygroundLink(
        "balcony://playground?screen=transcript&scenario=edge-cases&session=edge-long"
      )
    ).toEqual({
      scenario: "edge-cases",
      screen: "transcript",
      session: "edge-long",
    });
  });

  it("opens the scenario's own screen, and the busy day, when not given", () => {
    expect(parsePlaygroundLink("balcony://playground")).toEqual({
      scenario: "busy-day",
      screen: "sessions",
      session: undefined,
    });
    expect(
      parsePlaygroundLink("balcony://playground?scenario=pairing-wrong")
    ).toMatchObject({ screen: "pair" });
  });

  it("ignores unknown scenarios and screens", () => {
    expect(
      parsePlaygroundLink("balcony://playground?scenario=nope&screen=nope")
    ).toEqual({ scenario: "busy-day", screen: "sessions", session: undefined });
  });

  it("is not a playground link otherwise", () => {
    expect(parsePlaygroundLink("balcony://pair?code=123456")).toBeNull();
    expect(parsePlaygroundLink("https://example.com/playground")).toBeNull();
  });
});
