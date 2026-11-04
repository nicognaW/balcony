// The pairing token: the only gate on the API. It's created once and kept in
// Balcony's own folder, so a paired phone stays paired across restarts.
import path from "node:path";

import { Effect, FileSystem } from "effect";

const TOKEN_FILE = "token";

const newToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

export const loadOrCreateToken = Effect.fn("loadOrCreateToken")(
  function* loadOrCreateToken(stateDir: string) {
    const fs = yield* FileSystem.FileSystem;
    const tokenFile = path.join(stateDir, TOKEN_FILE);

    if (yield* fs.exists(tokenFile)) {
      const saved = (yield* fs.readFileString(tokenFile)).trim();

      if (saved !== "") {
        return saved;
      }
    }

    yield* fs.makeDirectory(stateDir, { mode: 0o700, recursive: true });
    const token = newToken();
    yield* fs.writeFileString(tokenFile, `${token}\n`, { mode: 0o600 });

    return token;
  }
);
