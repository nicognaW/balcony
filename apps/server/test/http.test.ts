// Seam A: what the server answers over plain HTTP and WebSocket upgrades.
import { rpcUrl } from "@balcony/client";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { Fixture } from "./fixture-server.ts";

/** Whether a WebSocket to /rpc sent with `origin` opens. */
const opens = (url: string, origin: string | undefined) =>
  Effect.callback<boolean>((resume) => {
    const socket = new WebSocket(url, {
      headers: origin === undefined ? {} : { Origin: origin },
    });

    socket.addEventListener("open", () => {
      socket.close();
      resume(Effect.succeed(true));
    });
    socket.addEventListener("error", () => resume(Effect.succeed(false)));
    socket.addEventListener("close", () => resume(Effect.succeed(false)));
  });

describe("the server over HTTP", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect(
      "accepts WebSockets from its own pages and from apps, not other sites",
      () =>
        Effect.gen(function* origins() {
          const { server } = yield* Fixture;
          const url = rpcUrl(server.origin, server.token);

          expect(yield* opens(url, server.origin)).toBe(true);
          expect(yield* opens(url, undefined)).toBe(true);
          expect(yield* opens(url, "http://evil.example")).toBe(false);
          expect(yield* opens(url, "null")).toBe(false);
        })
    );

    test.effect(
      "serves the app for a path that isn't valid percent-encoding",
      () =>
        Effect.gen(function* malformedPath() {
          const { server } = yield* Fixture;

          const [route, malformed] = yield* Effect.promise(() =>
            Promise.all([
              fetch(`${server.origin}/s/some-session`),
              fetch(`${server.origin}/%E0%A4%A`),
            ])
          );

          expect(malformed.status).toBe(route.status);
          expect(yield* Effect.promise(() => malformed.text())).toBe(
            yield* Effect.promise(() => route.text())
          );
        })
    );
  });
});
