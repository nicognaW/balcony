// Seam C: the playground's scenarios, served by the in-process fake of the
// contract, as the apps' screens receive them.
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "@effect/vitest";
import { ORPCError } from "@orpc/client";

import { createSessionList, settledPage } from "../src/index.ts";
import { createPlayground } from "../src/playground/index.ts";
import type { ScenarioId } from "../src/playground/index.ts";

const NOW = Date.parse("2026-01-15T12:00:00.000Z");

const open = (scenario: ScenarioId) =>
  createPlayground({ autoplayMs: null, now: () => NOW, scenario });

/** The next value of a live call. */
const pull = async <T>(iterator: AsyncIterator<T, unknown>): Promise<T> => {
  const result = await iterator.next();

  if (result.done === true) {
    throw new Error("The live call ended");
  }

  return result.value;
};

/** The first value of a live call. */
const first = async <T>(
  call: Promise<AsyncIterator<T, unknown>>
): Promise<T> => {
  const iterator = await call;
  const value = await pull(iterator);
  await iterator.return?.();

  return value;
};

describe("busy day", () => {
  it("lists Working, Waiting, Done and Settled sessions", async () => {
    const playground = open("busy-day");
    const { sessions } = await first(playground.client.sessions.watch());
    const { view } = createSessionList().update(sessions, NOW);

    expect(view.working.length).toBeGreaterThan(0);
    expect(view.main.some((row) => row.mark.kind === "done")).toBe(true);
    expect(view.main.some((row) => row.mark.kind === "time")).toBe(true);
    expect(view.settled.length).toBeGreaterThan(0);
    playground.close();
  });
});

describe("empty list", () => {
  it("has no sessions", async () => {
    const playground = open("empty");

    expect(await first(playground.client.sessions.watch())).toEqual({
      sessions: [],
    });
    playground.close();
  });
});

describe("edge cases", () => {
  it("has 60 Settled sessions, past the first page and the next", async () => {
    const playground = open("edge-cases");
    const { sessions } = await first(playground.client.sessions.watch());
    const { view } = createSessionList().update(sessions, NOW);

    expect(view.settled).toHaveLength(60);
    expect(settledPage(view.settled, 1).hidden).toBe(25);
    playground.close();
  });

  it("has a session with no branch, and one with no Transcript", async () => {
    const playground = open("edge-cases");
    const { sessions } = await first(playground.client.sessions.watch());

    expect(
      sessions.some((target) => target.branch === null && !target.settledAt)
    ).toBe(true);
    await expect(
      first(
        playground.client.transcript.watch({ sessionId: "edge-no-transcript" })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    playground.close();
  });

  it("has a Transcript with every entry kind", async () => {
    const playground = open("edge-cases");

    const update = await first(
      playground.client.transcript.watch({ sessionId: "edge-kinds" })
    );

    // Pages back to the start to see every entry.
    const page = await playground.client.transcript.read({
      before: update.entries[0]?.id,
      sessionId: "edge-kinds",
    });

    const kinds = new Set(
      [...page.entries, ...update.entries].map((entry) => entry.kind)
    );

    expect([...kinds].toSorted()).toEqual([
      "agent-text",
      "command-run",
      "file-change",
      "other-step",
      "subagent-started",
      "user-message",
    ]);
    playground.close();
  });

  it("pages a 200-entry Transcript back to its first entry", async () => {
    const playground = open("edge-cases");

    const latest = await first(
      playground.client.transcript.watch({ sessionId: "edge-long" })
    );

    expect(latest).toMatchObject({ hasEarlier: true, type: "latest" });

    let entries = latest.entries.length;
    let before = latest.entries[0]?.id;
    let pages = 1;
    let hasEarlier = true;

    while (hasEarlier) {
      // Each page needs the one after it.
      // oxlint-disable-next-line no-await-in-loop
      const page = await playground.client.transcript.read({
        before,
        sessionId: "edge-long",
      });

      entries += page.entries.length;
      const [oldest] = page.entries;
      before = oldest?.id;
      ({ hasEarlier } = page);
      pages += 1;
    }

    expect({ entries, first: before, pages }).toEqual({
      entries: 200,
      first: "edge-long-1",
      pages: 10,
    });
    playground.close();
  });
});

describe("live changes", () => {
  it("delivers an appended entry to an open Transcript and the new activity to the list", async () => {
    const playground = open("busy-day");

    const transcript = await playground.client.transcript.watch({
      sessionId: "pg-auth",
    });

    const list = await playground.client.sessions.watch();
    const latest = await transcript.next();
    await list.next();

    expect(latest.value).toMatchObject({ type: "latest" });

    playground.append();

    const appended = await transcript.next();
    expect(appended.value).toMatchObject({
      entries: [{ id: "pg-auth-live-1", kind: "other-step", label: "Read" }],
      type: "appended",
    });

    const value = await pull(list);
    expect(
      value.sessions.find((target) => target.id === "pg-auth")?.lastMessageAt
    ).toBe(new Date(NOW).toISOString());

    await transcript.return?.();
    await list.return?.();
    playground.close();
  });

  it("ends a Working turn, then starts one", async () => {
    const playground = open("busy-day");
    const list = await playground.client.sessions.watch();

    const statusOf = async () => {
      const { sessions } = await pull(list);

      return sessions.find((target) => target.id === "pg-paging")?.status;
    };

    expect(await statusOf()).toBe("working");
    playground.toggleStatus();
    expect(await statusOf()).toBe("waiting");
    playground.toggleStatus();
    expect(await statusOf()).toBe("working");

    await list.return?.();
    playground.close();
  });

  it("settles and un-settles through the contract, live", async () => {
    const playground = open("busy-day");
    const list = await playground.client.sessions.watch();

    const settledAt = async () => {
      const { sessions } = await pull(list);

      return sessions.find((target) => target.id === "pg-ci")?.settledAt;
    };

    expect(await settledAt()).toBeNull();
    await playground.client.sessions.settle({ id: "pg-ci" });
    expect(await settledAt()).toBe(new Date(NOW).toISOString());
    await playground.client.sessions.unsettle({ id: "pg-ci" });
    expect(await settledAt()).toBeNull();

    await list.return?.();
    playground.close();
  });
});

/** Whether `promise` settles within 20ms. */
const settlesSoon = async (promise: Promise<unknown>) => {
  let settled = false;

  const watch = async () => {
    try {
      await promise;
    } catch {
      // Settled all the same.
    }

    settled = true;
  };

  void watch();
  await sleep(20);

  return settled;
};

describe("connection", () => {
  it("holds calls while connecting, and answers them once connected", async () => {
    const playground = open("connecting");
    expect(playground.getState()).toBe("connecting");

    const list = playground.client.sessions.watch();
    expect(await settlesSoon(list)).toBe(false);

    playground.setConnection("connected");
    expect(playground.getState()).toBe("connected");
    const value = await pull(await list);
    expect(value.sessions.length).toBeGreaterThan(0);
    playground.close();
  });

  it("keeps the list while reconnecting, and sends what changed once back", async () => {
    const playground = open("reconnecting");
    const list = await playground.client.sessions.watch();
    await list.next();

    playground.append();
    const changed = pull(list);
    expect(await settlesSoon(changed)).toBe(false);

    playground.setConnection("connected");
    const { sessions } = await changed;
    expect(sessions[0]?.lastMessageAt).toBe(new Date(NOW).toISOString());
    playground.close();
  });

  it("ends live calls when it stops accepting the token", async () => {
    const playground = open("busy-day");
    const list = await playground.client.sessions.watch();
    await pull(list);

    playground.setConnection("refused");
    await expect(pull(list)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    playground.close();
  });

  it("refuses the token, and accepts a new pairing", async () => {
    const playground = open("refused");
    expect(playground.getState()).toBe("connected");

    await expect(playground.client.sessions.watch()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    await expect(
      playground.client.pairing.exchange({ code: "123456" })
    ).resolves.toMatchObject({ token: expect.any(String) });
    expect(playground.getConnection()).toBe("connected");
    await expect(playground.client.sessions.watch()).resolves.toBeDefined();
    playground.close();
  });
});

describe("pairing errors", () => {
  it("counts down the tries left for a wrong code, then locks", async () => {
    const playground = open("pairing-wrong");

    const attempt = async () => {
      try {
        return await playground.client.pairing.exchange({ code: "000 000" });
      } catch (error) {
        return error instanceof ORPCError
          ? { code: error.code, data: error.data }
          : error;
      }
    };

    expect(await attempt()).toEqual({
      code: "PAIRING_CODE_WRONG",
      data: { attemptsLeft: 4 },
    });
    expect(await attempt()).toMatchObject({ data: { attemptsLeft: 3 } });
    await attempt();
    await attempt();
    expect(await attempt()).toMatchObject({ code: "PAIRING_CODE_LOCKED" });
    playground.close();
  });

  it.each([
    ["pairing-expired", "PAIRING_CODE_EXPIRED"],
    ["pairing-locked", "PAIRING_CODE_LOCKED"],
  ] as const)("%s refuses every code with %s", async (scenario, code) => {
    const playground = open(scenario);

    await expect(
      playground.client.pairing.exchange({ code: "123 456" })
    ).rejects.toMatchObject({ code });
    playground.close();
  });
});
