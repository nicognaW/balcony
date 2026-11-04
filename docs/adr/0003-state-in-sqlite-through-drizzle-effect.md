# Balcony's state is SQLite in ~/.balcony, through Drizzle's own Effect driver

What the user has seen and dealt with (when each session was last viewed, settled and un-settled) is Balcony's only state of its own, and it must be shared by every client and survive restarts. It lives in `~/.balcony/state.db`, one row per session that has any mark.

Spec #1 planned to port Drizzle 1.0 RC's Effect integration from Bun Postgres to Bun SQLite. That port is not needed: `drizzle-orm@1.0.0-rc.5` already ships `drizzle-orm/effect-sqlite-bun`, which runs on `@effect/sql-sqlite-bun` (bun:sqlite), migrator included. Balcony uses it as published. Migrations are generated with `bunx --bun drizzle-kit generate` (drizzle-kit rc.5, config in `apps/server/drizzle.config.ts`), committed under `apps/server/src/db/migrations`, and applied by the server at start.

New activity un-settles a session without a write: the settle time is kept, and a session counts as Settled only while its last message is no newer than that time. The server works this out each time it sends the list, so it holds across restarts and needs no watcher.

## Consequences

- Balcony never writes to the agents' files; settling is invisible to Claude.
- A session never opened on any client is not Done, as in T3 Code; otherwise every session would be Done on first run.
- Times compare the server's clock (view, settle) with the agent's message times. Both come from the same Mac, so skew is not a concern.
- If Balcony is ever built with `bun build --compile`, the migrations folder won't exist at runtime; import each `migration.sql` as text and call the session-level `migrate` instead.
