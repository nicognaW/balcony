// Seam A: the client's reconnecting connection to the server.
import { connect } from "@balcony/client";
import type { Connection, ConnectionState } from "@balcony/client";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { Fixture } from "./fixture-server.ts";

/** Every state the connection reports from now on. */
const recordStates = (connection: Connection) => {
  const states: ConnectionState[] = [];

  connection.subscribe(() => states.push(connection.getState()));

  return states;
};

const untilConnected = (connection: Connection) =>
  Effect.callback<ConnectionState>((resume) => {
    if (connection.getState() === "connected") {
      resume(Effect.succeed(connection.getState()));

      return;
    }

    const unsubscribe = connection.subscribe(() => {
      if (connection.getState() === "connected") {
        unsubscribe();
        resume(Effect.succeed(connection.getState()));
      }
    });
  }).pipe(Effect.timeout("3 seconds"));

describe("a connection", () => {
  it.layer(Fixture.make(), { excludeTestServices: true })((test) => {
    test.effect("stops reconnecting once closed", () =>
      Effect.gen(function* closed() {
        const { server } = yield* Fixture;

        const connection = connect({
          retryDelayMs: 20,
          server: server.origin,
          token: server.token,
        });

        yield* untilConnected(connection);
        connection.close();
        const states = recordStates(connection);
        yield* Effect.sleep("300 millis");

        expect(states).not.toContain("connected");
      })
    );

    test.effect("stays open while idle: the server answers pings", () =>
      Effect.gen(function* idle() {
        const { server } = yield* Fixture;

        const connection = connect({
          pingIntervalMs: 20,
          pingTimeoutMs: 100,
          retryDelayMs: 20,
          server: server.origin,
          token: server.token,
        });

        yield* untilConnected(connection);
        const states = recordStates(connection);
        yield* Effect.sleep("500 millis");
        const whileOpen = [...states];
        connection.close();

        expect(whileOpen).toEqual([]);
      })
    );
  });
});
