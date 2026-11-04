// Seam A: the real server against a fixture home, through the generated client.
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

describe("status from the Transcript when Claude's status file can't be used", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect(
      "works out Working from the Transcript when the status files are malformed",
      () =>
        Effect.gen(function* malformedStatus() {
          const { server } = yield* Fixture;
          const list = yield* (yield* watchSessions(server.token)).next();

          // One record has an unknown status, the other is torn JSON; the
          // Transcript ends on a subagent the agent started.
          expect(find(list, fixtureSessions.malformedStatus)).toMatchObject({
            project: "shop-api",
            status: "working",
          });
        })
    );

    test.effect(
      "works out Waiting from the Transcript when the status file is left by a process that died",
      () =>
        Effect.gen(function* staleStatus() {
          const { server } = yield* Fixture;
          const list = yield* (yield* watchSessions(server.token)).next();

          // The record still says busy, but its turn ended before the crash.
          expect(find(list, fixtureSessions.tools)?.status).toBe("waiting");
        })
    );

    test.effect(
      "follows the Transcript's turns when a session has no status file",
      () =>
        Effect.gen(function* missingStatus() {
          const { claude, server, statusFile } = yield* Fixture;
          const watch = yield* watchSessions(server.token);

          // The working session's agent is running a command.
          yield* Effect.promise(() => rm(statusFile("41001.json")));
          expect(
            find(yield* watch.next(), fixtureSessions.working)?.status
          ).toBe("working");

          const transcript = path.join(
            claude,
            "projects",
            "-Users-nico-code-notes-site",
            `${fixtureSessions.long}.jsonl`
          );

          const append = (line: string) =>
            Effect.promise(() => appendFile(transcript, `${line}\n`));

          const envelope = {
            cwd: "/Users/nico/code/notes.site",
            sessionId: fixtureSessions.long,
          };

          yield* append(
            JSON.stringify({
              ...envelope,
              message: { content: "Now tidy post 20.", role: "user" },
              origin: { kind: "human" },
              timestamp: "2026-01-15T12:00:01.000Z",
              type: "user",
              uuid: "0d8a7a52-0000-4000-8000-000000000003",
            })
          );

          yield* watch.next(
            (list) => find(list, fixtureSessions.long)?.status === "working"
          );

          yield* append(
            JSON.stringify({
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
            })
          );

          yield* watch.next(
            (list) => find(list, fixtureSessions.long)?.status === "waiting"
          );
        })
    );
  });
});

// An agent that crashed leaves its turn open in the Transcript: Claude never
// wrote the end of the reply, or the result of the tool it was calling.
describe("a session whose agent crashed mid-turn", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect(
      "shows Waiting once its unfinished tool call is a few minutes old",
      () =>
        Effect.gen(function* crashedInToolCall() {
          const { clock, server, statusFile } = yield* Fixture;
          const watch = yield* watchSessions(server.token);

          // The working session's last line is a Bash call from 11:59:23,
          // and its process left no status file.
          yield* Effect.promise(() => rm(statusFile("41001.json")));
          clock.now = Date.parse("2026-01-15T12:04:00.000Z");
          expect(
            find(yield* watch.next(), fixtureSessions.working)?.status
          ).toBe("working");

          clock.now = Date.parse("2026-01-15T12:04:30.000Z");
          yield* watch.next(
            (list) => find(list, fixtureSessions.working)?.status === "waiting"
          );
        })
    );
  });

  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect(
      "shows Waiting once its reply, cut off mid-stream, is a few minutes old",
      () =>
        Effect.gen(function* crashedInReply() {
          const { claude, clock, server } = yield* Fixture;
          const watch = yield* watchSessions(server.token);
          yield* watch.next();

          // The long session has no status file. The agent starts a reply to
          // a new prompt and stops without a stop reason.
          const envelope = {
            cwd: "/Users/nico/code/notes.site",
            sessionId: fixtureSessions.long,
          };

          const lines = [
            {
              ...envelope,
              message: { content: "Now tidy post 20.", role: "user" },
              origin: { kind: "human" },
              timestamp: "2026-01-15T12:00:01.000Z",
              type: "user",
              uuid: "0d8a7a52-0000-4000-8000-000000000005",
            },
            {
              ...envelope,
              message: {
                content: [{ text: "Looking at post 20", type: "text" }],
                id: "msg_0000000000000000000000f7",
                role: "assistant",
                stop_reason: null,
              },
              timestamp: "2026-01-15T12:00:05.000Z",
              type: "assistant",
              uuid: "0d8a7a52-0000-4000-8000-000000000006",
            },
          ];

          yield* Effect.promise(() =>
            appendFile(
              path.join(
                claude,
                "projects",
                "-Users-nico-code-notes-site",
                `${fixtureSessions.long}.jsonl`
              ),
              lines.map((line) => `${JSON.stringify(line)}\n`).join("")
            )
          );

          yield* watch.next(
            (list) =>
              find(list, fixtureSessions.long)?.lastMessageAt ===
                "2026-01-15T12:00:05.000Z" &&
              find(list, fixtureSessions.long)?.status === "working"
          );

          clock.now = Date.parse("2026-01-15T12:05:06.000Z");
          yield* watch.next(
            (list) => find(list, fixtureSessions.long)?.status === "waiting"
          );
        })
    );
  });

  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("stays Working while its live status file says busy", () =>
      Effect.gen(function* busyWins() {
        const { clock, server } = yield* Fixture;
        const watch = yield* watchSessions(server.token);
        yield* watch.next();

        // Nearly a day on the same Bash call, with status 41001 still busy.
        // The 24-hour window ages the waiting session out on the same poll,
        // so the list is known to be computed at the new time.
        clock.now = Date.parse("2026-01-16T11:50:00.000Z");

        const later = yield* watch.next(
          (list) => find(list, fixtureSessions.waiting) === undefined
        );

        expect(find(later, fixtureSessions.working)?.status).toBe("working");
      })
    );
  });
});
