// The real server running against a fixture home, for Seam A tests.
import { BunServices } from "@effect/platform-bun";
import { Context, Effect, Layer } from "effect";

import { startServer } from "../src/server.ts";
import type { RunningServer } from "../src/server.ts";
import { fixtureHome } from "./fixture-home.ts";
import type { FixtureHome } from "./fixture-home.ts";

export class FixtureServer extends Context.Service<
  FixtureServer,
  FixtureHome & { readonly server: RunningServer }
>()("test/FixtureServer") {
  static readonly layer = Layer.effect(
    FixtureServer,
    Effect.gen(function* makeFixtureServer() {
      const home = yield* fixtureHome;

      const server = yield* startServer({
        home: home.home,
        hostname: "127.0.0.1",
        pollInterval: "50 millis",
        port: 0,
      });

      return { ...home, server };
    })
  ).pipe(Layer.provide(BunServices.layer));
}

/** Runs a client call as an Effect, failing with the client's error. */
export const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ catch: (error) => error, try: run });
