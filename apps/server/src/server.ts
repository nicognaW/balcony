// The Balcony server: the oRPC API over WebSocket at /rpc and the built web
// app, on one port. It runs while its scope is open.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RPCHandler } from "@orpc/server/websocket";
import { Effect, Layer } from "effect";
import type { Duration } from "effect";

import { AgentSources } from "./agents/agent-source.ts";
import { makeClaudeSource } from "./agents/claude/claude-source.ts";
import { makePairingCodes, PairingCodes } from "./pairing-code.ts";
import type { PairingCode } from "./pairing-code.ts";
import { router } from "./rpc.ts";
import type { RpcContext } from "./rpc.ts";
import { Sessions } from "./sessions.ts";
import { loadOrCreateToken } from "./token.ts";
import { Transcripts } from "./transcripts.ts";

export interface ServerOptions {
  /** The user's home folder: Claude's files are read from `<home>/.claude`, Balcony's kept in `<home>/.balcony`. */
  readonly home: string;
  /** 0 picks a free port. */
  readonly port: number;
  readonly hostname: string;
  /** How often agent files are checked for changes. */
  readonly pollInterval?: Duration.Input;
  /** The current time in epoch ms, for session activity and pairing code expiry. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** The built web app. Defaults to `apps/web/dist`. */
  readonly webRoot?: string;
}

export interface RunningServer {
  /** e.g. `http://127.0.0.1:7766` */
  readonly origin: string;
  readonly port: number;
  readonly token: string;
  /** Issues a short pairing code to show, replacing the previous one. */
  readonly newPairingCode: Effect.Effect<PairingCode>;
}

const defaultWebRoot = fileURLToPath(
  new URL("../../web/dist", import.meta.url)
);

/** The web app file for a request path, with index.html for app routes. */
const staticFile = async (webRoot: string, pathname: string) => {
  const file = path.normalize(path.join(webRoot, decodeURIComponent(pathname)));

  if (file.startsWith(webRoot + path.sep)) {
    const found = Bun.file(file);

    if (await found.exists()) {
      return found;
    }
  }

  const index = Bun.file(path.join(webRoot, "index.html"));

  return (await index.exists()) ? index : undefined;
};

const serveWebApp = async (webRoot: string, pathname: string) => {
  const file = await staticFile(webRoot, pathname);

  if (file === undefined) {
    return new Response("The web app isn't built. Run `bun run build`.", {
      status: 503,
    });
  }

  const immutable = pathname.startsWith("/assets/");

  return new Response(file, {
    headers: {
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    },
  });
};

interface SocketData {
  readonly token: string | null;
}

export const startServer = Effect.fn("startServer")(function* startServer(
  options: ServerOptions
) {
  const token = yield* loadOrCreateToken(path.join(options.home, ".balcony"));
  const now = options.now ?? Date.now;

  const claude = yield* makeClaudeSource({
    claudeDir: path.join(options.home, ".claude"),
    now,
    pollInterval: options.pollInterval ?? "1 second",
  });

  const pairingCodes = yield* makePairingCodes({
    now,
    token,
  });

  const context = yield* Layer.build(
    Layer.merge(
      Layer.mergeAll(Sessions.layer, Transcripts.layer).pipe(
        Layer.provide(Layer.succeed(AgentSources, [claude]))
      ),
      Layer.succeed(PairingCodes, pairingCodes)
    )
  );

  const handler = new RPCHandler<RpcContext>(router);
  const webRoot = path.normalize(options.webRoot ?? defaultWebRoot);

  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve<SocketData>({
        fetch: (request, bun) => {
          const url = new URL(request.url);

          if (url.pathname === "/rpc") {
            // Browsers can't set WebSocket headers, so the token travels as a
            // query parameter. The `authed` middleware checks it on each call.
            const upgraded = bun.upgrade(request, {
              data: { token: url.searchParams.get("token") },
            });

            return upgraded
              ? undefined
              : new Response("Expected a WebSocket", { status: 400 });
          }

          return serveWebApp(webRoot, url.pathname);
        },
        hostname: options.hostname,
        port: options.port,
        websocket: {
          close: (socket) => {
            handler.close(socket);
          },
          message: (socket, message) => {
            void handler.message(socket, message, {
              context: {
                "effect/context": context,
                serverToken: token,
                token: socket.data.token,
              },
            });
          },
        },
      })
    ),
    (bun) => Effect.promise(() => bun.stop(true))
  );

  const port = server.port ?? options.port;

  const running: RunningServer = {
    newPairingCode: pairingCodes.issue,
    origin: `http://${options.hostname}:${port}`,
    port,
    token,
  };

  return running;
});
