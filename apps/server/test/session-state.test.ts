// Seam A: what the user has seen and dealt with (Done, Settled), kept on the
// Mac and shared live by every client.
import { appendFile } from "node:fs/promises";
import path from "node:path";

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
