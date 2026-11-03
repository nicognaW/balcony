// Seam C: the session list view model, given session data and the time.
import type { Session } from "@balcony/contracts";
import { describe, expect, it } from "@effect/vitest";

import { createSessionList } from "../src/session-list.ts";
import type { SessionListView } from "../src/session-list.ts";

const at = (time: string) => Date.parse(`2026-01-15T${time}Z`);

const session = (id: string, fields: Partial<Session> = {}): Session => ({
  agent: "claude",
  branch: null,
  id,
  lastMessageAt: "2026-01-15T09:00:00.000Z",
  lastUserMessageAt: null,
  project: "balcony",
  status: "waiting",
  title: `Session ${id}`,
  turnEndedAt: null,
  turnStartedAt: null,
  ...fields,
});

const ids = (rows: SessionListView["main"]) => rows.map((row) => row.id);

describe("session list", () => {
  it("puts Working sessions in a section above the main list", () => {
    const list = createSessionList();

    const { view } = list.update(
      [session("a"), session("b", { status: "working" }), session("c")],
      at("12:00:00")
    );

    expect(ids(view.working)).toEqual(["b"]);
    expect(ids(view.main)).toEqual(["a", "c"]);
  });

  it("orders the main list by the newest of the user's last message and the agent's last turn start or finish", () => {
    const { view } = createSessionList().update(
      [
        // Messaged most recently, but the agent hasn't answered.
        session("asked", { lastUserMessageAt: "2026-01-15T11:00:00.000Z" }),
        // Finished a turn later than anyone else did anything.
        session("finished", {
          lastUserMessageAt: "2026-01-15T08:00:00.000Z",
          turnEndedAt: "2026-01-15T11:30:00.000Z",
          turnStartedAt: "2026-01-15T08:00:01.000Z",
        }),
        // Started a turn on its own (a background task woke it) and stopped.
        session("woken", {
          lastUserMessageAt: "2026-01-15T07:00:00.000Z",
          turnEndedAt: "2026-01-15T10:45:00.000Z",
          turnStartedAt: "2026-01-15T10:50:00.000Z",
        }),
        session("quiet", {
          lastUserMessageAt: "2026-01-15T06:00:00.000Z",
          turnEndedAt: "2026-01-15T06:10:00.000Z",
          turnStartedAt: "2026-01-15T06:00:01.000Z",
        }),
      ],
      at("12:00:00")
    );

    expect(ids(view.main)).toEqual(["finished", "asked", "woken", "quiet"]);
  });

  it("breaks ties in the main list by id, so the order never flickers", () => {
    const same = { turnEndedAt: "2026-01-15T11:00:00.000Z" };

    const { view } = createSessionList().update(
      [session("b", same), session("c", same), session("a", same)],
      at("12:00:00")
    );

    expect(ids(view.main)).toEqual(["a", "b", "c"]);
  });

  it("orders Working sessions by when the user last sent them a message", () => {
    const { view } = createSessionList().update(
      [
        session("older", {
          lastUserMessageAt: "2026-01-15T10:00:00.000Z",
          status: "working",
          turnStartedAt: "2026-01-15T11:59:00.000Z",
        }),
        session("newer", {
          lastUserMessageAt: "2026-01-15T11:00:00.000Z",
          status: "working",
          turnStartedAt: "2026-01-15T11:00:01.000Z",
        }),
        // No message from the user: its turn start stands in.
        session("woken", {
          status: "working",
          turnStartedAt: "2026-01-15T10:30:00.000Z",
        }),
      ],
      at("12:00:00")
    );

    expect(ids(view.working)).toEqual(["newer", "woken", "older"]);
  });

  describe("rows", () => {
    it("show the project, title and branch", () => {
      const { view } = createSessionList().update(
        [
          session("a", {
            branch: "feature/rate-limit",
            project: "shop-api",
            title: "What does the rate limiter do when Redis is down?",
          }),
        ],
        at("12:00:00")
      );

      expect(view.main[0]).toMatchObject({
        branch: "feature/rate-limit",
        project: "shop-api",
        title: "What does the rate limiter do when Redis is down?",
      });
    });

    it("mark a Working session with when its turn began", () => {
      const { view } = createSessionList().update(
        [
          session("a", {
            lastUserMessageAt: "2026-01-15T11:58:00.000Z",
            status: "working",
            turnStartedAt: "2026-01-15T11:58:00.000Z",
          }),
        ],
        at("12:00:00")
      );

      expect(view.working[0]?.mark).toEqual({
        kind: "working",
        since: at("11:58:00"),
      });
    });

    it("show other sessions' time of the user's last message, or the last message when the user sent none", () => {
      const { view } = createSessionList().update(
        [
          session("asked", {
            lastMessageAt: "2026-01-15T11:30:00.000Z",
            lastUserMessageAt: "2026-01-15T11:00:00.000Z",
            turnEndedAt: "2026-01-15T11:30:00.000Z",
          }),
          session("unasked", {
            lastMessageAt: "2026-01-15T10:00:00.000Z",
            turnEndedAt: "2026-01-15T10:00:00.000Z",
          }),
        ],
        at("12:00:00")
      );

      expect(view.main.map((row) => row.mark)).toEqual([
        { at: at("11:00:00"), kind: "time" },
        { at: at("10:00:00"), kind: "time" },
      ]);
    });
  });

  describe("Working grace", () => {
    const running = session("run", {
      lastUserMessageAt: "2026-01-15T11:59:00.000Z",
      status: "working",
      turnStartedAt: "2026-01-15T11:59:01.000Z",
    });

    const stopped: Session = {
      ...running,
      status: "waiting",
      turnEndedAt: "2026-01-15T12:00:10.000Z",
    };

    it("keeps a session in Working for 2 seconds after it stops", () => {
      const list = createSessionList();
      list.update([running], at("12:00:00"));

      const justStopped = list.update([stopped], at("12:00:10"));
      expect(ids(justStopped.view.working)).toEqual(["run"]);
      expect(justStopped.view.main).toEqual([]);
      expect(justStopped.nextChangeAt).toBe(at("12:00:12"));

      const stillInGrace = list.update([stopped], at("12:00:11.999"));
      expect(ids(stillInGrace.view.working)).toEqual(["run"]);

      const afterGrace = list.update([stopped], at("12:00:12"));
      expect(afterGrace.view.working).toEqual([]);
      expect(ids(afterGrace.view.main)).toEqual(["run"]);
      expect(afterGrace.nextChangeAt).toBeNull();
    });

    it("counts the grace from when the session was first seen stopped", () => {
      const list = createSessionList();
      list.update([running], at("12:00:00"));
      list.update([stopped], at("12:00:10"));

      // A later update with the same data doesn't restart the grace.
      expect(list.update([stopped], at("12:00:11")).nextChangeAt).toBe(
        at("12:00:12")
      );
    });

    it("keeps a session in Working without a break when it starts again within the grace", () => {
      const list = createSessionList();
      list.update([running], at("12:00:00"));
      list.update([stopped], at("12:00:10"));
      const again = list.update([running], at("12:00:11"));

      expect(ids(again.view.working)).toEqual(["run"]);
      expect(again.nextChangeAt).toBeNull();

      // Stopping again starts a fresh grace.
      const stoppedAgain = list.update([stopped], at("12:00:20"));
      expect(ids(stoppedAgain.view.working)).toEqual(["run"]);
      expect(stoppedAgain.nextChangeAt).toBe(at("12:00:22"));
    });

    it("gives no grace to a session first seen already stopped", () => {
      const { nextChangeAt, view } = createSessionList().update(
        [stopped],
        at("12:00:10")
      );

      expect(view.working).toEqual([]);
      expect(ids(view.main)).toEqual(["run"]);
      expect(nextChangeAt).toBeNull();
    });

    it("sorts a session that left Working by when it left", () => {
      const list = createSessionList();

      const other = session("other", {
        turnEndedAt: "2026-01-15T12:00:11.000Z",
      });

      // The agent's own times say the turn ended long ago.
      const staleStop = { ...stopped, turnEndedAt: "2026-01-15T11:59:30.000Z" };
      list.update([running, other], at("12:00:00"));
      list.update([staleStop, other], at("12:00:10"));
      const { view } = list.update([staleStop, other], at("12:00:12"));

      expect(ids(view.main)).toEqual(["run", "other"]);
    });

    it("forgets sessions that leave the list", () => {
      const list = createSessionList();
      list.update([running], at("12:00:00"));
      list.update([], at("12:00:05"));

      // Back later, already stopped: no grace from the earlier run.
      const { nextChangeAt, view } = list.update([stopped], at("12:00:10"));
      expect(view.working).toEqual([]);
      expect(nextChangeAt).toBeNull();
    });
  });
});
