#!/usr/bin/env bun
// `balcony`: starts the server, prints the pairing QR code, runs until Ctrl-C.
import { homedir, networkInterfaces } from "node:os";
import { createInterface } from "node:readline";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Stream } from "effect";
import { renderUnicodeCompact } from "uqr";

import type { PairingCode } from "./pairing-code.ts";
import { startServer } from "./server.ts";
import type { RunningServer } from "./server.ts";

const DEFAULT_PORT = 7766;

/** The Mac's address on the local network, for the phone to reach. */
const lanAddress = (): string => {
  const addresses = Object.values(networkInterfaces()).flatMap(
    (list) => list ?? []
  );

  return (
    addresses.find((address) => address.family === "IPv4" && !address.internal)
      ?.address ?? "localhost"
  );
};

/** The address the phone opens. The token rides in the fragment, which is never sent over the network. */
export const pairingUrl = (host: string, port: number, token: string): string =>
  `http://${host}:${port}/#${new URLSearchParams({ token }).toString()}`;

/** `482913` as `482 913`, easier to read off the screen. */
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const clockTime = (epochMs: number) =>
  new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Prints a code, then says so once it has expired. */
const showCode = (code: PairingCode) =>
  Stream.fromEffect(
    Console.log(
      `Or type this code on the phone: ${spaced(code.code)}  (until ${clockTime(code.expiresAt)}; Enter for a new one)`
    )
  ).pipe(
    Stream.concat(
      Stream.fromEffect(
        Effect.sleep(Math.max(0, code.expiresAt - Date.now())).pipe(
          Effect.andThen(
            Console.log("The pairing code expired. Press Enter for a new one.")
          )
        )
      )
    )
  );

/**
 * The terminal is Balcony's pairing screen: a short code is shown at start and
 * each time Enter is pressed, and only the latest one is accepted. See
 * docs/adr/0002-short-pairing-code-in-the-terminal.md.
 */
const stdinClosed = () => "stdin closed";

const pairingScreen = (server: RunningServer) => {
  // Not a terminal readline, so Ctrl-C still reaches the process as SIGINT.
  const lines = createInterface({ input: process.stdin, terminal: false });

  const enterPresses = Stream.fromAsyncIterable(lines, stdinClosed);

  return Stream.make("start").pipe(
    Stream.concat(enterPresses),
    Stream.switchMap(() =>
      Stream.unwrap(server.newPairingCode.pipe(Effect.map(showCode)))
    ),
    Stream.runDrain,
    Effect.ignore
  );
};

const program = Effect.gen(function* main() {
  const server = yield* startServer({
    home: homedir(),
    hostname: "0.0.0.0",
    port: Number(process.env.BALCONY_PORT ?? DEFAULT_PORT),
  });

  const url = pairingUrl(lanAddress(), server.port, server.token);
  yield* Console.log(renderUnicodeCompact(url));
  yield* Console.log(
    `Balcony is running. Scan the QR code with your phone, or open:\n\n  ${url}\n`
  );
  yield* Console.log("Press Ctrl-C to stop.\n");
  yield* pairingScreen(server);

  return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

BunRuntime.runMain(program);
