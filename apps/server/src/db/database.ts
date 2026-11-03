// Balcony's SQLite database in ~/.balcony, through Drizzle's Effect driver for
// bun:sqlite (drizzle-orm/effect-sqlite-bun). Migrations run at start.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SqliteClient } from "@effect/sql-sqlite-bun";
import * as SqliteBunDrizzle from "drizzle-orm/effect-sqlite-bun";
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator";
import { Context, Effect, Layer } from "effect";

const makeDb = SqliteBunDrizzle.makeWithDefaults();

const migrationsFolder = fileURLToPath(new URL("migrations", import.meta.url));

export class Database extends Context.Service<
  Database,
  Effect.Success<typeof makeDb>
>()("balcony/Database") {
  /** The database in `<dir>/state.db`, created and migrated if needed. */
  static readonly layer = (dir: string) =>
    Layer.effect(
      Database,
      Effect.gen(function* openDatabase() {
        const db = yield* makeDb;
        yield* migrate(db, { migrationsFolder });

        return db;
      })
    ).pipe(
      Layer.provide(
        Layer.unwrap(
          Effect.sync(() => {
            mkdirSync(dir, { mode: 0o700, recursive: true });

            return SqliteClient.layer({
              filename: path.join(dir, "state.db"),
            });
          })
        )
      ),
      Layer.orDie
    );
}
