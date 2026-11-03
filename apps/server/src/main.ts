#!/usr/bin/env bun
// `balcony`: starts the server, prints the pairing QR code, runs until Ctrl-C.
import { homedir, networkInterfaces } from "node:os";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import { renderUnicodeCompact } from "uqr";

import { startServer } from "./server.ts";

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

const program = Effect.gen(function* main() {
  const server = yield* startServer({
    home: homedir(),
    hostname: "0.0.0.0",
    port: Number(process.env.BALCONY_PORT ?? DEFAULT_PORT),
  });

  const url = pairingUrl(lanAddress(), server.port, server.token);
  yield* Console.log(renderUnicodeCompact(url));
  yield* Console.log(
    `Balcony is running. Scan the code with your phone, or open:\n\n  ${url}\n`
  );
  yield* Console.log("Press Ctrl-C to stop.");

  return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

BunRuntime.runMain(program);
