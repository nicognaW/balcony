// Seam A: what the user has seen and dealt with (Done, Settled), kept on the
// Mac and shared live by every client.
import { appendFile } from "node:fs/promises";
import path from "node:path";

import { connect, createSessionList, keepViewing } from "@balcony/client";
import type { ConnectOptions, SessionListView } from "@balcony/client";
import type { SessionList } from "@balcony/contracts";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startServer } from "../src/server.ts";
import { fixtureNow, fixtureSessions } from "./fixture-home.ts";
import {
  call,
  clientOf,
  find,
  Fixture,
  snapshotFiles,
  watchSessions,
} from "./fixture-server.ts";

const fixtureNowIso = "2026-01-15T12:00:00.000Z";

const sessionId = (name: string): string => {
  const id = fixtureSessions[name];

  if (id === undefined) {
    throw new Error(`No fixture session ${name}`);
  }

  return id;
};

/** The fields of a Claude Transcript line that these tests write. */
interface ClaudeLine {
  readonly cwd: string;
  readonly sessionId: string;
  readonly message: {
    readonly content: string | readonly { text: string; type: "text" }[];
    readonly id?: string;
    readonly role: "user" | "assistant";
    readonly stop_reason?: string;
  };
  readonly origin?: { readonly kind: string };
  readonly timestamp: string;
  readonly type: "user" | "assistant";
  readonly uuid: string;
}

const long = sessionId("long");
const tools = sessionId("tools");
const waiting = sessionId("waiting");
const working = sessionId("working");

describe("Done and Settled over the oRPC WebSocket", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect(
      "opening a session on one client marks it viewed on every client",
      () =>
        Effect.gen(function* marksViewed() {
          const { server } = yield* Fixture;
          const other = yield* watchSessions(server.token);
          const before = yield* other.next();
          expect(find(before, waiting)?.lastViewedAt).toBeNull();

          const phone = yield* clientOf(server.token);
          yield* call(() => phone.sessions.markViewed({ id: waiting }));

          const after = yield* other.next(
            (list) => find(list, waiting)?.lastViewedAt !== null
          );

          expect(find(after, waiting)?.lastViewedAt).toBe(fixtureNowIso);
        })
    );

    test.effect(
      "settles and un-settles a session by hand, on every client",
      () =>
        Effect.gen(function* settlesByHand() {
          const { clock, server } = yield* Fixture;
          const other = yield* watchSessions(server.token);
          const before = yield* other.next();
          expect(find(before, tools)).toMatchObject({
            settledAt: null,
            unsettledAt: null,
          });

          const phone = yield* clientOf(server.token);
          yield* call(() => phone.sessions.settle({ id: tools }));

          const settled = yield* other.next(
            (list) => find(list, tools)?.settledAt !== null
          );

          expect(find(settled, tools)?.settledAt).toBe(fixtureNowIso);

          clock.now = Date.parse("2026-01-15T12:05:00.000Z");
          yield* call(() => phone.sessions.unsettle({ id: tools }));

          const unsettled = yield* other.next(
            (list) => find(list, tools)?.settledAt === null
          );

          expect(find(unsettled, tools)?.unsettledAt).toBe(
            "2026-01-15T12:05:00.000Z"
          );
        })
    );
  });
});

interface Place {
  readonly section: "working" | "main" | "settled";
  readonly mark: "working" | "done" | "time";
}

/** Where a session shows in a client's list. */
const placeOf = (view: SessionListView, id: string): Place | undefined => {
  for (const section of ["working", "main", "settled"] as const) {
    const row = view[section].find((candidate) => candidate.id === id);

    if (row !== undefined) {
      return { mark: row.mark.kind, section };
    }
  }

  return undefined;
};

/**
 * A client that watches the list and lays it out with the shared view model,
 * as the web and Android apps do.
 */
const listClient = Effect.fn("listClient")(function* listClient(token: string) {
  const { clock } = yield* Fixture;
  const watch = yield* watchSessions(token);
  const model = createSessionList();

  const viewOf = (list: SessionList) =>
    model.update(list.sessions, clock.now).view;

  /** Waits for a list in which session `id` shows at `place`. */
  const sees = (id: string, place: Place) =>
    watch.next((list) => {
      const shown = placeOf(viewOf(list), id);

      return shown?.section === place.section && shown.mark === place.mark;
    });

  return { client: yield* clientOf(token), sees };
});

describe("the web app and the Android app", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("see each other's Done and Settled changes live", () =>
      Effect.gen(function* stayInSync() {
        const { clock, server } = yield* Fixture;
        const web = yield* listClient(server.token);
        const phone = yield* listClient(server.token);

        // The phone opened the session before its last turn ended.
        clock.now = Date.parse("2026-01-15T08:00:00.000Z");
        yield* call(() => phone.client.sessions.markViewed({ id: waiting }));
        yield* web.sees(waiting, { mark: "done", section: "main" });
        yield* phone.sees(waiting, { mark: "done", section: "main" });

        // Opening it in the browser clears Done on the phone.
        clock.now = fixtureNow;
        yield* call(() => web.client.sessions.markViewed({ id: waiting }));
        yield* phone.sees(waiting, { mark: "time", section: "main" });

        // Settled on the phone, un-settled in the browser.
        yield* call(() => phone.client.sessions.settle({ id: waiting }));
        yield* web.sees(waiting, { mark: "time", section: "settled" });

        yield* call(() => web.client.sessions.unsettle({ id: waiting }));
        yield* phone.sees(waiting, { mark: "time", section: "main" });
      })
    );
  });
});

describe("a turn that ends while the session is open", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("never shows as Done on another client", () =>
      Effect.gen(function* viewedWhileOpen() {
        const { claude, clock, server } = yield* Fixture;
        const watch = yield* watchSessions(server.token);

        // A fresh list model for each list, so no Working grace hides Done.
        const markOf = (list: SessionList) =>
          placeOf(
            createSessionList().update(list.sessions, clock.now).view,
            long
          )?.mark;

        // Every list the web app is sent, until `until` passes; none may
        // show the open session as Done.
        const shownDone: SessionList[] = [];

        const receive = (until: (list: SessionList) => boolean) =>
          watch.next((list) => {
            if (markOf(list) === "done") {
              shownDone.push(list);
            }

            return until(list);
          });

        // The phone opens the session.
        const phone = yield* clientOf(server.token);
        const stopViewing = keepViewing(phone, long);
        yield* receive(
          (list) => find(list, long)?.lastViewedAt === fixtureNowIso
        );

        const transcript = path.join(
          claude,
          "projects",
          "-Users-nico-code-notes-site",
          `${long}.jsonl`
        );

        const append = (line: ClaudeLine) =>
          Effect.promise(() =>
            appendFile(transcript, `${JSON.stringify(line)}\n`)
          );

        const envelope = {
          cwd: "/Users/nico/code/notes.site",
          sessionId: long,
        };

        yield* append({
          ...envelope,
          message: { content: "Now tidy post 20.", role: "user" },
          origin: { kind: "human" },
          timestamp: "2026-01-15T12:00:01.000Z",
          type: "user",
          uuid: "0d8a7a52-0000-4000-8000-000000000003",
        });
        yield* receive((list) => find(list, long)?.status === "working");

        yield* append({
          ...envelope,
          message: {
            content: [{ text: "Post 20 is tidy.", type: "text" }],
            id: "msg_0000000000000000000000f6",
            role: "assistant",
            stop_reason: "end_turn",
          },
          timestamp: "2026-01-15T12:00:09.000Z",
          type: "assistant",
          uuid: "0d8a7a52-0000-4000-8000-000000000004",
        });
        yield* receive(
          (list) =>
            find(list, long)?.turnEndedAt === "2026-01-15T12:00:09.000Z" &&
            find(list, long)?.status === "waiting"
        );

        // The phone closes it (or goes to the background) a minute later.
        clock.now = Date.parse("2026-01-15T12:01:00.000Z");
        stopViewing();

        const closed = yield* receive(
          (list) =>
            find(list, long)?.lastViewedAt === "2026-01-15T12:01:00.000Z"
        );

        expect(markOf(closed)).toBe("time");
        expect(shownDone).toEqual([]);
      })
    );
  });
});

describe("a phone that goes silent while a session is open", () => {
  it.layer(Fixture.make({ silentSocketTimeout: "300 millis" }), {
    excludeTestServices: true,
  })((test) => {
    test.effect("stops holding it open once the server drops its socket", () =>
      Effect.gen(function* silentPhone() {
        const { clock, server } = yield* Fixture;

        /** A connection that closes with the test. */
        const opened = (options: Partial<ConnectOptions>) =>
          Effect.acquireRelease(
            Effect.sync(() =>
              connect({
                server: server.origin,
                token: server.token,
                ...options,
              })
            ),
            (connection) => Effect.sync(() => connection.close())
          );

        // The web app pings often enough to stay connected.
        const web = (yield* opened({ pingIntervalMs: 50 })).client;

        const lists = yield* Effect.acquireRelease(
          call(() => web.sessions.watch()),
          (iterator) => Effect.promise(async () => await iterator.return?.())
        );

        const until = (pass: (list: SessionList) => boolean) =>
          Effect.promise(async () => {
            for (;;) {
              // oxlint-disable-next-line no-await-in-loop -- each list waits for the one before.
              const result = await lists.next();

              if (result.done === true) {
                throw new Error("The session list ended");
              }

              if (pass(result.value)) {
                return result.value;
              }
            }
          }).pipe(Effect.timeout("3 seconds"));

        // The phone opens the session, then its network dies: it sends
        // nothing more, and never closes its socket.
        const phone = yield* opened({
          pingIntervalMs: 60_000,
          pingTimeoutMs: 60_000,
          retryDelayMs: 60_000,
        });

        yield* Effect.acquireRelease(
          Effect.sync(() => keepViewing(phone.client, long)),
          (stop) => Effect.sync(stop)
        );
        yield* until(
          (list) => find(list, long)?.lastViewedAt === fixtureNowIso
        );

        // The hold ends, which marks it viewed again, at the new time.
        clock.now = Date.parse("2026-01-15T12:01:00.000Z");
        yield* until(
          (list) =>
            find(list, long)?.lastViewedAt === "2026-01-15T12:01:00.000Z"
        );
      })
    );
  });
});

describe("new activity after settling", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("un-settles the session by itself", () =>
      Effect.gen(function* autoUnsettles() {
        const { claude, server } = yield* Fixture;
        const watch = yield* watchSessions(server.token);
        yield* watch.next();

        const phone = yield* clientOf(server.token);
        yield* call(() => phone.sessions.settle({ id: waiting }));
        yield* watch.next((list) => find(list, waiting)?.settledAt !== null);

        const line = {
          cwd: "/Users/nico/code/shop-api",
          gitBranch: "feature/rate-limit",
          message: { content: "And when Redis comes back?", role: "user" },
          origin: { kind: "human" },
          sessionId: waiting,
          timestamp: "2026-01-15T12:00:30.000Z",
          type: "user",
          uuid: "0d8a7a52-0000-4000-8000-000000000003",
        };

        yield* Effect.promise(() =>
          appendFile(
            path.join(
              claude,
              "projects",
              "-Users-nico-code-shop-api",
              `${waiting}.jsonl`
            ),
            `${JSON.stringify(line)}\n`
          )
        );

        const active = yield* watch.next(
          (list) =>
            find(list, waiting)?.lastMessageAt === "2026-01-15T12:00:30.000Z"
        );

        expect(find(active, waiting)?.settledAt).toBeNull();
      })
    );
  });
});

describe("Balcony's state on the Mac", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("survives a restart", () =>
      Effect.gen(function* survivesRestart() {
        const { home, server } = yield* Fixture;
        const phone = yield* clientOf(server.token);
        yield* call(() => phone.sessions.markViewed({ id: working }));
        yield* call(() => phone.sessions.settle({ id: tools }));

        const restarted = yield* startServer({
          home,
          hostname: "127.0.0.1",
          now: () => fixtureNow,
          port: 0,
        }).pipe(Effect.provide(BunServices.layer));

        const list = yield* (yield* watchSessions(
          server.token,
          restarted.origin
        )).next();

        expect(find(list, working)?.lastViewedAt).toBe(fixtureNowIso);
        expect(find(list, tools)?.settledAt).toBe(fixtureNowIso);
      })
    );

    test.effect("is never written to Claude's files", () =>
      Effect.gen(function* leavesClaudeAlone() {
        const { claude, server } = yield* Fixture;
        const watch = yield* watchSessions(server.token);
        yield* watch.next();
        const before = yield* snapshotFiles(claude);

        const phone = yield* clientOf(server.token);
        yield* call(() => phone.sessions.markViewed({ id: waiting }));
        yield* call(() => phone.sessions.settle({ id: waiting }));
        yield* call(() => phone.sessions.unsettle({ id: waiting }));
        yield* watch.next((list) => find(list, waiting)?.unsettledAt !== null);

        expect(yield* snapshotFiles(claude)).toEqual(before);
      })
    );

    test.effect("rejects changes without the token", () =>
      Effect.gen(function* rejectsWithoutToken() {
        const phone = yield* clientOf("not-the-token");

        const refused = yield* Effect.flip(
          call(() => phone.sessions.settle({ id: waiting }))
        );

        expect(refused).toMatchObject({ code: "UNAUTHORIZED" });
      })
    );
  });
});
