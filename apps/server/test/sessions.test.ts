// Seam A: the real server against a fixture home, through the generated client.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startServer } from "../src/server.ts";
import { fixtureNow, fixtureSessions } from "./fixture-home.ts";
import {
  find,
  Fixture,
  snapshotFiles,
  watchSessions,
} from "./fixture-server.ts";

describe("sessions over the oRPC WebSocket", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("rejects calls without the token", () =>
      Effect.gen(function* rejectsWithoutToken() {
        const missing = yield* Effect.flip(
          Effect.flatMap(watchSessions(null), ({ next }) => next())
        );

        expect(missing).toMatchObject({ code: "UNAUTHORIZED" });

        const wrong = yield* Effect.flip(
          Effect.flatMap(watchSessions("not-the-token"), ({ next }) => next())
        );

        expect(wrong).toMatchObject({ code: "UNAUTHORIZED" });
      })
    );

    test.effect("lists Claude sessions with their project and status", () =>
      Effect.gen(function* listsSessions() {
        const { server } = yield* Fixture;
        const list = yield* (yield* watchSessions(server.token)).next();
        expect(find(list, fixtureSessions.working)).toMatchObject({
          agent: "claude",
          branch: "main",
          lastMessageAt: "2026-01-15T11:59:23.003Z",
          lastUserMessageAt: "2026-01-15T11:54:00.031Z",
          project: "balcony",
          status: "working",
          title: "Run the test suite and fix whatever fails.",
          turnEndedAt: null,
          turnStartedAt: "2026-01-15T11:54:00.031Z",
        });
        expect(find(list, fixtureSessions.waiting)).toMatchObject({
          branch: "feature/rate-limit",
          lastUserMessageAt: "2026-01-15T11:10:00.031Z",
          project: "shop-api",
          status: "waiting",
          title: "What does the rate limiter do when Redis is down?",
          turnEndedAt: "2026-01-15T11:48:03.003Z",
          turnStartedAt: "2026-01-15T11:10:00.031Z",
        });
        // A finished background task woke the agent for a second turn.
        expect(find(list, fixtureSessions.tools)).toMatchObject({
          branch: "ticket-4",
          lastUserMessageAt: "2026-01-15T10:00:00.031Z",
          turnEndedAt: "2026-01-15T10:25:03.000Z",
          turnStartedAt: "2026-01-15T10:01:59.917Z",
        });
        expect(find(list, fixtureSessions.longRunning)).toMatchObject({
          title: "Design the pairing flow",
        });
        // One entry per session: subagent transcripts are not sessions.
        const ids = list.sessions.map((session) => session.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.filter((id) => id.startsWith("agent-"))).toEqual([]);
      })
    );

    test.effect("updates live when a session's status changes", () =>
      Effect.gen(function* statusChanges() {
        const { server, statusFile } = yield* Fixture;
        const watch = yield* watchSessions(server.token);
        const before = yield* watch.next();
        expect(find(before, fixtureSessions.waiting)?.status).toBe("waiting");

        const file = statusFile("41002.json");
        const record = yield* Effect.promise(() => readFile(file, "utf-8"));
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => writeFile(file, record))
        );
        yield* Effect.promise(() =>
          writeFile(
            file,
            JSON.stringify({ ...JSON.parse(record), status: "busy" })
          )
        );

        const after = yield* watch.next(
          (list) => find(list, fixtureSessions.waiting)?.status === "working"
        );

        expect(find(after, fixtureSessions.waiting)?.project).toBe("shop-api");
      })
    );

    test.effect("lists a new session as soon as its transcript appears", () =>
      Effect.gen(function* newSession() {
        const { claude, server } = yield* Fixture;
        const watch = yield* watchSessions(server.token);
        const id = "7cd4e1a0-0000-4000-8000-000000000008";
        expect(find(yield* watch.next(), id)).toBeUndefined();

        const project = path.join(
          claude,
          "projects",
          "-Users-nico-code-new-thing"
        );

        const line = {
          cwd: "/Users/nico/code/new-thing",
          message: { content: "Sketch a landing page.", role: "user" },
          origin: { kind: "human" },
          sessionId: id,
          timestamp: "2026-01-15T12:00:01.000Z",
          type: "user",
          uuid: "0d8a7a52-0000-4000-8000-000000000001",
        };

        yield* Effect.promise(async () => {
          await mkdir(project);
          await writeFile(
            path.join(project, `${id}.jsonl`),
            `${JSON.stringify(line)}\n`
          );
        });
        const after = yield* watch.next((list) => find(list, id) !== undefined);
        expect(find(after, id)).toMatchObject({
          lastMessageAt: "2026-01-15T12:00:01.000Z",
          project: "new-thing",
          title: "Sketch a landing page.",
        });
      })
    );

    test.effect("keeps a paired phone paired across restarts", () =>
      Effect.gen(function* staysPaired() {
        const { home, server } = yield* Fixture;

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

        expect(find(list, fixtureSessions.working)?.project).toBe("balcony");
      })
    );

    test.effect(
      "lists sessions whose last message is within 24 hours, however old the session is",
      () =>
        Effect.gen(function* window() {
          const { server } = yield* Fixture;
          const list = yield* (yield* watchSessions(server.token)).next();

          // Started three days ago, messaged half an hour ago.
          expect(find(list, fixtureSessions.longRunning)).toMatchObject({
            lastMessageAt: "2026-01-15T11:30:03.000Z",
          });
          // Last messaged 26 hours ago.
          expect(find(list, fixtureSessions.old)).toBeUndefined();
        })
    );

    test.effect("reads Claude's files without changing them", () =>
      Effect.gen(function* readOnly() {
        const { claude, server } = yield* Fixture;
        const before = yield* snapshotFiles(claude);
        const watch = yield* watchSessions(server.token);
        yield* watch.next();
        yield* Effect.sleep("200 millis");
        expect(yield* snapshotFiles(claude)).toEqual(before);
      })
    );
  });
});

describe("the 24-hour window", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect(
      "drops a session once its last message is 24 hours old, and lists it again when it gets a new one",
      () =>
        Effect.gen(function* windowMoves() {
          const { claude, clock, server } = yield* Fixture;
          const watch = yield* watchSessions(server.token);
          expect(
            find(yield* watch.next(), fixtureSessions.waiting)
          ).toBeDefined();

          // A day after the waiting session's last message (11:48:03), but not
          // yet a day after the working one's (11:59:23).
          clock.now = Date.parse("2026-01-16T11:50:00.000Z");

          const later = yield* watch.next(
            (list) => find(list, fixtureSessions.waiting) === undefined
          );

          expect(find(later, fixtureSessions.working)).toBeDefined();
          expect(find(later, fixtureSessions.old)).toBeUndefined();

          const line = {
            cwd: "/Users/nico/code/shop-api",
            message: { content: "Is CI green on Node 24 now?", role: "user" },
            origin: { kind: "human" },
            sessionId: fixtureSessions.old,
            timestamp: "2026-01-16T11:49:00.000Z",
            type: "user",
            uuid: "0d8a7a52-0000-4000-8000-000000000002",
          };

          yield* Effect.promise(() =>
            appendFile(
              path.join(
                claude,
                "projects",
                "-Users-nico-code-shop-api",
                `${fixtureSessions.old}.jsonl`
              ),
              `${JSON.stringify(line)}\n`
            )
          );

          const messaged = yield* watch.next(
            (list) => find(list, fixtureSessions.old) !== undefined
          );

          expect(find(messaged, fixtureSessions.old)).toMatchObject({
            lastMessageAt: "2026-01-16T11:49:00.000Z",
            lastUserMessageAt: "2026-01-16T11:49:00.000Z",
            title: "Bump the Node version in CI to 24.",
          });
        })
    );
  });
});
