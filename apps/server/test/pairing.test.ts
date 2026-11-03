// Seam A: pairing by short code, through the generated client over WebSocket.
import { exchangePairingCode } from "@balcony/client";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";

import { startServer } from "../src/server.ts";
import type { RunningServer } from "../src/server.ts";
import { fixtureHome } from "./fixture-home.ts";

/** A clock the tests move by hand. */
const clock = { now: Date.parse("2026-01-15T12:00:00.000Z") };

class Fixture extends Context.Service<Fixture, RunningServer>()(
  "test/PairingFixture"
) {
  static readonly layer = Layer.effect(
    Fixture,
    Effect.gen(function* makeFixture() {
      const { home } = yield* fixtureHome;

      return yield* startServer({
        home,
        hostname: "127.0.0.1",
        now: () => clock.now,
        port: 0,
      });
    })
  ).pipe(Layer.provide(BunServices.layer));
}

const exchange = (server: RunningServer, code: string) =>
  Effect.tryPromise({
    catch: (error) => error,
    try: () => exchangePairingCode({ code, server: server.origin }),
  });

const passTime = (ms: number) =>
  Effect.sync(() => {
    clock.now += ms;
  });

/** A six-digit code that differs from `code`. */
const otherCode = (code: string) =>
  ((Number(code) + 1) % 1_000_000).toString().padStart(6, "0");

describe("pairing by short code", () => {
  it.layer(Fixture.layer, { excludeTestServices: true })((test) => {
    test.effect("exchanges the code shown on the Mac for the token", () =>
      Effect.gen(function* exchangesCode() {
        const server = yield* Fixture;
        const { code } = yield* server.newPairingCode;

        expect(code).toMatch(/^\d{6}$/u);
        expect(yield* exchange(server, code)).toBe(server.token);
      })
    );

    test.effect("accepts the code typed with the space it's shown with", () =>
      Effect.gen(function* acceptsSpaced() {
        const server = yield* Fixture;
        const { code } = yield* server.newPairingCode;
        const typed = ` ${code.slice(0, 3)} ${code.slice(3)} `;

        expect(yield* exchange(server, typed)).toBe(server.token);
      })
    );

    test.effect("refuses a code that isn't the one shown", () =>
      Effect.gen(function* refusesWrongCode() {
        const server = yield* Fixture;
        const { code } = yield* server.newPairingCode;

        const refused = yield* Effect.flip(exchange(server, otherCode(code)));

        expect(refused).toMatchObject({
          code: "PAIRING_CODE_WRONG",
          data: { attemptsLeft: 4 },
        });
      })
    );

    test.effect("accepts a code until it expires after 10 minutes", () =>
      Effect.gen(function* expires() {
        const server = yield* Fixture;
        const first = yield* server.newPairingCode;
        expect(first.expiresAt).toBe(clock.now + 10 * 60 * 1000);

        yield* passTime(10 * 60 * 1000 - 1);
        expect(yield* exchange(server, first.code)).toBe(server.token);

        const second = yield* server.newPairingCode;
        yield* passTime(10 * 60 * 1000);
        const refused = yield* Effect.flip(exchange(server, second.code));

        expect(refused).toMatchObject({ code: "PAIRING_CODE_EXPIRED" });
      })
    );

    test.effect("locks the code after five wrong tries", () =>
      Effect.gen(function* locks() {
        const server = yield* Fixture;
        const { code } = yield* server.newPairingCode;
        const wrong = otherCode(code);

        for (const attemptsLeft of [4, 3, 2, 1]) {
          expect(yield* Effect.flip(exchange(server, wrong))).toMatchObject({
            code: "PAIRING_CODE_WRONG",
            data: { attemptsLeft },
          });
        }

        expect(yield* Effect.flip(exchange(server, wrong))).toMatchObject({
          code: "PAIRING_CODE_LOCKED",
        });
        // Even the right code is refused now, until the Mac shows a new one.
        expect(yield* Effect.flip(exchange(server, code))).toMatchObject({
          code: "PAIRING_CODE_LOCKED",
        });

        const fresh = yield* server.newPairingCode;
        expect(yield* exchange(server, fresh.code)).toBe(server.token);
      })
    );

    test.effect("accepts a code once", () =>
      Effect.gen(function* usedOnce() {
        const server = yield* Fixture;
        const { code } = yield* server.newPairingCode;
        yield* exchange(server, code);

        const reused = yield* Effect.flip(exchange(server, code));

        expect(reused).toMatchObject({ code: "PAIRING_CODE_EXPIRED" });
      })
    );
  });
});
