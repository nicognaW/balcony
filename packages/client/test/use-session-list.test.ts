// Seam C: the session list hook, rendered as each app renders it.
import type { Session } from "@balcony/contracts";
import { describe, expect, it } from "@effect/vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { connect } from "../src/index.ts";
import { PairedContext, orpcOf, useSessionList } from "../src/react.ts";
import type { Paired } from "../src/react.ts";

const at = (time: string) => Date.parse(`2026-01-15T${time}Z`);

const session = (id: string, fields: Partial<Session> = {}): Session => ({
  agent: "claude",
  branch: null,
  id,
  lastMessageAt: "2026-01-15T09:00:00.000Z",
  lastUserMessageAt: null,
  lastViewedAt: null,
  project: "balcony",
  settledAt: null,
  status: "waiting",
  title: `Session ${id}`,
  turnEndedAt: null,
  turnStartedAt: null,
  unsettledAt: null,
  ...fields,
});

/** A paired app on its own connection, which no call here opens. */
const pairedApp = (): Paired => {
  const connection = connect({ server: "http://127.0.0.1:1", token: "t" });

  return {
    connection,
    orpc: orpcOf(connection),
    server: "http://127.0.0.1:1",
    unpair: () => {},
  };
};

/** The ids in the Working section, as one render of the list shows them. */
const workingIds = (
  paired: Paired,
  sessions: readonly Session[],
  receivedAt: number
): string => {
  const List = () =>
    useSessionList(sessions, receivedAt)
      .working.map((row) => row.id)
      .join(",");

  return renderToString(
    createElement(PairedContext, { value: paired }, createElement(List))
  );
};

describe("useSessionList", () => {
  it("keeps each connection's Working grace apart from another list's", () => {
    const real = pairedApp();
    const playground = pairedApp();

    expect(
      workingIds(real, [session("a", { status: "working" })], at("12:00:00"))
    ).toBe("a");

    // The playground's list renders sessions the real one doesn't have.
    workingIds(playground, [session("p")], at("12:00:01"));

    // Session a just finished: it stays in Working for the grace.
    expect(workingIds(real, [session("a")], at("12:00:02"))).toBe("a");
  });
});
