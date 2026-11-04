// The real server against a fixture home, and a client that watches it: the
// pieces every Seam A test starts from.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { connect } from "@balcony/client";
import type { Session, SessionList } from "@balcony/contracts";
import { BunServices } from "@effect/platform-bun";
import { Context, Effect, Layer } from "effect";

import { startServer } from "../src/server.ts";
import type { RunningServer, ServerOptions } from "../src/server.ts";
import { fixtureHome, fixtureNow } from "./fixture-home.ts";
import type { FixtureHome } from "./fixture-home.ts";

/** The server's clock: fixture time unless a test moves it. */
export interface TestClock {
  now: number;
}

export class Fixture extends Context.Service<
  Fixture,
  FixtureHome & { readonly server: RunningServer; readonly clock: TestClock }
>()("test/Fixture") {
  /** A fresh fixture home and server, separate for each layer built. */
  static readonly make = (
    options: Pick<ServerOptions, "silentSocketTimeout"> = {}
  ) =>
    Layer.effect(
      Fixture,
      Effect.gen(function* makeFixture() {
        const home = yield* fixtureHome;
        const clock: TestClock = { now: fixtureNow };

        const server = yield* startServer({
          home: home.home,
          hostname: "127.0.0.1",
          now: () => clock.now,
          pollInterval: "50 millis",
          port: 0,
          ...options,
        });

        return { ...home, clock, server };
      })
    ).pipe(Layer.provide(BunServices.layer));
}

/**
 * Opens `sessions.watch` with a token. `next(until)` waits for the next list
 * that passes `until`; the watch closes with the test's scope.
 */
export const watchSessions = Effect.fn("watchSessions")(function* watchSessions(
  token: string | null,
  origin?: string
) {
  const { server } = yield* Fixture;
  const { client } = connect({ server: origin ?? server.origin, token });

  const lists = yield* Effect.acquireRelease(
    Effect.tryPromise({
      catch: (error) => error,
      try: () => client.sessions.watch(),
    }),
    (iterator) => Effect.promise(async () => await iterator.return?.())
  );

  const nextMatching = async (
    until: (list: SessionList) => boolean
  ): Promise<SessionList> => {
    const result = await lists.next();

    if (result.done === true) {
      throw new Error("The session list ended");
    }

    return until(result.value) ? result.value : nextMatching(until);
  };

  const next = (until: (list: SessionList) => boolean = () => true) =>
    Effect.tryPromise({
      catch: (error) => error,
      try: () => nextMatching(until),
    }).pipe(Effect.timeout("5 seconds"));

  return { next };
});

/** Every file under a folder, with its bytes and modification time. */
export const snapshotFiles = (dir: string) =>
  Effect.promise(async () => {
    const entries = await readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });

    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .toSorted();

    return Promise.all(
      files.map(async (file) => {
        const [bytes, info] = await Promise.all([readFile(file), stat(file)]);

        return { bytes: bytes.toString("base64"), file, mtime: info.mtimeMs };
      })
    );
  });

export const find = (
  list: SessionList,
  id: string | undefined
): Session | undefined => list.sessions.find((session) => session.id === id);

/** A client of the fixture server, as a separate phone or browser would be. */
export const clientOf = Effect.fn("clientOf")(function* clientOf(
  token: string
) {
  const { server } = yield* Fixture;

  return connect({ server: server.origin, token }).client;
});

/** Calls a client procedure, failing the Effect when the call does. */
export const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ catch: (error) => error, try: run });
