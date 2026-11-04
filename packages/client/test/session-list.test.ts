// Seam C: the session list view model, given session data and the time.
import type { Session } from "@balcony/contracts";
import { describe, expect, it } from "@effect/vitest";

import { createSessionList, settledPage } from "../src/session-list.ts";
import type { SessionListView } from "../src/session-list.ts";

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

  describe("Done", () => {
    const finished = {
      lastMessageAt: "2026-01-15T11:30:00.000Z",
      lastUserMessageAt: "2026-01-15T11:00:00.000Z",
      turnEndedAt: "2026-01-15T11:30:00.000Z",
    };

    it("marks a session that finished a turn after the user last viewed it", () => {
      const { view } = createSessionList().update(
        [
          session("unseen", {
            ...finished,
            lastViewedAt: "2026-01-15T11:10:00.000Z",
          }),
          session("seen", {
            ...finished,
            lastViewedAt: "2026-01-15T11:40:00.000Z",
          }),
        ],
        at("12:00:00")
      );

      expect(view.main.map((row) => [row.id, row.mark])).toEqual([
        ["seen", { at: at("11:00:00"), kind: "time" }],
        ["unseen", { kind: "done" }],
      ]);
    });

    it("doesn't mark a session the user has never opened", () => {
      const { view } = createSessionList().update(
        [session("new", finished)],
        at("12:00:00")
      );

      expect(view.main[0]?.mark).toEqual({ at: at("11:00:00"), kind: "time" });
    });

    it("shows Working rather than Done while a new turn runs", () => {
      const { view } = createSessionList().update(
        [
          session("again", {
            ...finished,
            lastViewedAt: "2026-01-15T11:10:00.000Z",
            status: "working",
            turnStartedAt: "2026-01-15T11:50:00.000Z",
          }),
        ],
        at("12:00:00")
      );

      expect(view.working[0]?.mark.kind).toBe("working");
    });
  });

  describe("Settled", () => {
    it("moves settled sessions out of the main list into their own section, most recently settled first", () => {
      const { view } = createSessionList().update(
        [
          session("open"),
          session("early", { settledAt: "2026-01-15T10:00:00.000Z" }),
          session("late", { settledAt: "2026-01-15T11:00:00.000Z" }),
        ],
        at("12:00:00")
      );

      expect(ids(view.main)).toEqual(["open"]);
      expect(ids(view.settled)).toEqual(["late", "early"]);
    });

    it("keeps a settled session out of Working, with no grace", () => {
      const list = createSessionList();
      const running = session("run", { status: "working" });
      list.update([running], at("12:00:00"));

      const { nextChangeAt, view } = list.update(
        [{ ...running, settledAt: "2026-01-15T12:00:05.000Z" }],
        at("12:00:05")
      );

      expect(view.working).toEqual([]);
      expect(ids(view.settled)).toEqual(["run"]);
      expect(nextChangeAt).toBeNull();
    });

    it("brings a session back when new activity un-settles it", () => {
      const list = createSessionList();
      const quiet = session("s", { settledAt: "2026-01-15T11:00:00.000Z" });
      expect(ids(list.update([quiet], at("12:00:00")).view.settled)).toEqual([
        "s",
      ]);

      // The server clears settledAt once the session has a newer message.
      const { view } = list.update(
        [{ ...quiet, settledAt: null, status: "working" }],
        at("12:00:05")
      );

      expect(view.settled).toEqual([]);
      expect(ids(view.working)).toEqual(["s"]);
    });

    it("puts a session un-settled by hand at the top of the main list", () => {
      const { view } = createSessionList().update(
        [
          session("recent", { turnEndedAt: "2026-01-15T11:00:00.000Z" }),
          session("back", {
            turnEndedAt: "2026-01-15T08:00:00.000Z",
            unsettledAt: "2026-01-15T11:30:00.000Z",
          }),
        ],
        at("12:00:00")
      );

      expect(ids(view.main)).toEqual(["back", "recent"]);
    });

    it("shows 10 settled sessions, then 25 more each time the user asks", () => {
      const { view } = createSessionList().update(
        Array.from({ length: 40 }, (_, index) =>
          session(`s${String(index).padStart(2, "0")}`, {
            settledAt: "2026-01-15T10:00:00.000Z",
          })
        ),
        at("12:00:00")
      );

      const first = settledPage(view.settled, 0);
      expect(ids(first.rows)).toEqual(ids(view.settled).slice(0, 10));
      expect(first.hidden).toBe(30);

      const second = settledPage(view.settled, 1);
      expect(second.rows).toHaveLength(35);
      expect(second.hidden).toBe(5);

      const third = settledPage(view.settled, 2);
      expect(third.rows).toHaveLength(40);
      expect(third.hidden).toBe(0);
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

describe("row titles", () => {
  it("names a session with no title, or only spaces, Untitled session", () => {
    const { view } = createSessionList().update(
      [session("a", { title: "" }), session("b", { title: " \n " })],
      at("12:00:00")
    );

    expect(view.main.map((row) => row.title)).toEqual([
      "Untitled session",
      "Untitled session",
    ]);
  });

  it("puts a title written over several lines on one", () => {
    const { view } = createSessionList().update(
      [session("a", { title: "Line one\nLine two  \t and three " })],
      at("12:00:00")
    );

    expect(view.main[0]?.title).toBe("Line one Line two and three");
  });
});
