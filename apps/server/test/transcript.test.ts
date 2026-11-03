// Seam A: Transcripts through the generated client, against fixture sessions.
import { appendFile } from "node:fs/promises";
import path from "node:path";

import { connect } from "@balcony/client";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fixtureSessions } from "./fixture-home.ts";
import { call, FixtureServer } from "./fixture-server.ts";

/** A fixture session's id by its manifest name. */
const fixtureId = (name: string): string => {
  const id = fixtureSessions[name];

  if (id === undefined) {
    throw new Error(`No fixture session ${name}`);
  }

  return id;
};

const client = Effect.gen(function* makeClient() {
  const { server } = yield* FixtureServer;

  return connect({ server: server.origin, token: server.token }).client;
});

describe("Transcripts over the oRPC WebSocket", () => {
  it.layer(FixtureServer.layer, { excludeTestServices: true })((test) => {
    test.effect(
      "normalises messages, file changes, subagents and commands",
      () =>
        Effect.gen(function* normalises() {
          const { transcript } = yield* client;

          const page = yield* call(() =>
            transcript.read({ sessionId: fixtureId("tools") })
          );

          expect(page.hasEarlier).toBe(false);
          expect(page.entries).toMatchObject([
            {
              at: "2026-01-15T10:00:00.031Z",
              kind: "user-message",
              text: "Add a fixture loader for the server tests and get a reviewer subagent to check it.",
            },
            {
              kind: "agent-text",
              text: "Plan: write the loader, wire it into the test setup, then ask a subagent to review.",
            },
            {
              kind: "file-change",
              path: "/Users/nico/code/balcony/apps/server/test/fixtures.ts",
            },
            {
              kind: "file-change",
              path: "/Users/nico/code/balcony/apps/server/test/setup.ts",
            },
            {
              kind: "file-change",
              path: "/Users/nico/code/balcony/apps/server/package.json",
            },
            {
              kind: "file-change",
              path: "/Users/nico/code/balcony/docs/explore.ipynb",
            },
            {
              command: "bunx vitest run apps/server",
              description: "Run server tests",
              kind: "command-run",
            },
            {
              command: "git push origin ticket-4",
              description: "Push branch",
              kind: "command-run",
            },
            {
              description: "Review fixture loader",
              kind: "subagent-started",
              subagentType: "general-purpose",
            },
            {
              kind: "agent-text",
              text: "The loader is in place and tests pass. A reviewer subagent is checking it now; the push failed (permission denied), so the branch is local only.",
            },
            {
              kind: "agent-text",
              text: "The reviewer found no problems with the loader.",
            },
          ]);
        })
    );

    test.effect("loads the latest 20 entries, then pages back", () =>
      Effect.gen(function* pagesBack() {
        const { transcript } = yield* client;
        const sessionId = fixtureId("long");
        const latest = yield* call(() => transcript.read({ sessionId }));

        expect(latest.hasEarlier).toBe(true);
        expect(latest.entries).toHaveLength(20);
        expect(latest.entries[0]).toMatchObject({
          command: "head -5 content/posts/15.md",
          kind: "command-run",
        });
        expect(latest.entries.slice(-2)).toMatchObject([
          { kind: "user-message", text: "Thanks, that's all." },
          { kind: "agent-text", text: "You're welcome." },
        ]);

        const pages = [latest];

        while (pages[0]?.hasEarlier === true) {
          const before = pages[0].entries[0]?.id ?? "";

          pages.unshift(
            yield* call(() => transcript.read({ before, sessionId }))
          );
        }

        expect(pages.map((page) => page.entries.length)).toEqual([
          12, 20, 20, 20, 20,
        ]);

        const all = pages.flatMap((page) => page.entries);
        expect(new Set(all.map((entry) => entry.id)).size).toBe(all.length);
        expect(all.slice(0, 5)).toMatchObject([
          {
            kind: "user-message",
            text: "Step 1: tidy up post 01 front matter.",
          },
          { kind: "agent-text", text: "Checking post 01." },
          { command: "head -5 content/posts/01.md", kind: "command-run" },
          {
            kind: "file-change",
            path: "/Users/nico/code/notes.site/content/posts/01.md",
          },
          { kind: "agent-text", text: "Quoted the title of post 01." },
        ]);

        // Step 9 was interrupted while a command waited for permission.
        const interrupted = all.findIndex(
          (entry) => entry.kind === "other-step"
        );

        expect(all.slice(interrupted - 1, interrupted + 2)).toMatchObject([
          { command: "bun run build", kind: "command-run" },
          { kind: "other-step", label: "Interrupted" },
          {
            kind: "user-message",
            text: "Step 10: tidy up post 10 front matter.",
          },
        ]);
      })
    );

    test.effect("appends new entries live while the session is open", () =>
      Effect.gen(function* appendsLive() {
        const { transcript } = yield* client;
        const { claude } = yield* FixtureServer;
        const sessionId = fixtureId("waiting");

        const updates = yield* Effect.acquireRelease(
          call(() => transcript.watch({ sessionId })),
          (iterator) => Effect.promise(async () => await iterator.return?.())
        );

        const next = call(async () => {
          const result = await updates.next();

          if (result.done === true) {
            throw new Error("The watch ended");
          }

          return result.value;
        }).pipe(Effect.timeout("5 seconds"));

        const first = yield* next;
        expect(first).toMatchObject({ hasEarlier: false, type: "latest" });
        expect(first.entries.at(-1)).toMatchObject({
          kind: "agent-text",
          text: expect.stringContaining("It **fails open**"),
        });

        const file = path.join(
          claude,
          "projects",
          "-Users-nico-code-shop-api",
          `${sessionId}.jsonl`
        );

        const envelope = {
          cwd: "/Users/nico/code/shop-api",
          isSidechain: false,
          sessionId,
        };

        const prompt = JSON.stringify({
          ...envelope,
          message: { content: "Now add a test for that.", role: "user" },
          origin: { kind: "human" },
          timestamp: "2026-01-15T12:00:01.000Z",
          type: "user",
          uuid: "5e1f0a00-0000-4000-8000-000000000001",
        });

        const command = JSON.stringify({
          ...envelope,
          message: {
            content: [
              {
                id: "toolu_live",
                input: { command: "bun test rate-limit", description: "Run" },
                name: "Bash",
                type: "tool_use",
              },
            ],
            model: "claude-opus-5-5",
            role: "assistant",
            stop_reason: "tool_use",
          },
          timestamp: "2026-01-15T12:00:04.000Z",
          type: "assistant",
          uuid: "5e1f0a00-0000-4000-8000-000000000002",
        });

        // Claude may be caught mid-write: half a line must wait for the rest.
        yield* Effect.promise(() =>
          appendFile(file, `${prompt}\n${command.slice(0, 40)}`)
        );
        expect(yield* next).toEqual({
          entries: [
            {
              at: "2026-01-15T12:00:01.000Z",
              id: "5e1f0a00-0000-4000-8000-000000000001",
              kind: "user-message",
              text: "Now add a test for that.",
            },
          ],
          type: "appended",
        });

        yield* Effect.promise(() => appendFile(file, `${command.slice(40)}\n`));
        expect(yield* next).toMatchObject({
          entries: [
            {
              command: "bun test rate-limit",
              description: "Run",
              kind: "command-run",
            },
          ],
          type: "appended",
        });
      })
    );

    test.effect("fails with NOT_FOUND for an unknown session or entry", () =>
      Effect.gen(function* notFound() {
        const { transcript } = yield* client;

        const session = yield* Effect.flip(
          call(() => transcript.read({ sessionId: "no-such-session" }))
        );

        expect(session).toMatchObject({ code: "NOT_FOUND" });

        const entry = yield* Effect.flip(
          call(() =>
            transcript.read({
              before: "no-such-entry",
              sessionId: fixtureId("long"),
            })
          )
        );

        expect(entry).toMatchObject({ code: "NOT_FOUND" });

        // Ids never become paths: a traversal attempt is just unknown.
        const traversal = yield* Effect.flip(
          call(() => transcript.read({ sessionId: "../sessions/41001" }))
        );

        expect(traversal).toMatchObject({ code: "NOT_FOUND" });
      })
    );

    test.effect("rejects Transcript calls without the token", () =>
      Effect.gen(function* rejects() {
        const { server } = yield* FixtureServer;

        const { transcript } = connect({
          server: server.origin,
          token: null,
        }).client;

        const error = yield* Effect.flip(
          call(() => transcript.read({ sessionId: fixtureId("long") }))
        );

        expect(error).toMatchObject({ code: "UNAUTHORIZED" });
      })
    );
  });
});
