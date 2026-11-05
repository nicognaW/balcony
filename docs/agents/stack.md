# Stack

Effect 4, oRPC 2 beta and Drizzle 1.0 RC are newer than most training data. The workspaces' `package.json` files hold the versions; ADR-0003 covers the database.

## Versions

- **Pin exact versions** (`bun add -E`) and keep each package at the same version in every workspace (sherif checks). A prerelease range like `^2.0.0-beta.48` floats to later betas, which break.
- **oRPC: every `@orpc/*` package at the same beta.** Each depends on its siblings' exact versions, so a mismatch installs duplicates. The dist-tags mislead: `@orpc/server` with no tag installs v1, and `@orpc/effect`'s `latest` is an older beta.
- **Drizzle: `drizzle-orm@rc`.** Its `latest` tag is 0.x. `drizzle-orm/effect-sqlite-bun` runs on `@effect/sql-sqlite-bun`.
- **Effect: 4.x only.** `@effect/platform` and `@effect/sql` (0.x) are v3 packages; `FileSystem`, `Path` and SQL now live in `effect` itself, with Bun's implementation in `@effect/platform-bun`.

## Effect 4, coming from v3

- Services: `class X extends Context.Service<X, Shape>()("balcony/X") {}`; `Context.Tag`, `GenericTag` and `Effect.Service` are gone.
- `Layer.effect` handles scoped resources (no `Layer.scoped`); `Layer.unwrapEffect` is `Layer.unwrap`.
- `Effect.forkChild` (was `fork`), `Effect.catch` (was `catchAll`), `Effect.result` and `Result` (were `either` and `Either`).
- Schema: `Schema.Literals([...])`, `Schema.Union([...])` take arrays; `Schema.fromJsonString` (was `parseJson`); `decodeUnknownEffect` / `decodeUnknownSync` / `decodeUnknownOption`.
- `Stream.callback` replaces `async` / `asyncPush`.

## oRPC with Effect

- Contracts turn Effect Schemas into Standard Schema with `Schema.toStandardSchemaV1`. `@orpc/effect/extensions/schema` would do it implicitly but pulls `@orpc/server` into the contracts graph.
- Keep wire schemas JSON-shaped, without decoding transforms: oRPC validates outputs on the server, so a transform would run against the handler's return value.
- Handlers use `.effect(function* name() {…})` from `@orpc/effect/extensions/effect`; services come from the context's `"effect/context"`. Errors other than declared ones and `ORPCError` reach the client as `INTERNAL_SERVER_ERROR`.
- Event iterators: an Effect Stream must be wrapped into an `AsyncIteratorObject` (`streamToIterator` in `apps/server/src/rpc.ts`). `Stream.toAsyncIterableWith` alone fails output validation, and an async generator wrapper holds a client's stop until the next value.
- Browsers can't set WebSocket headers, so the token travels as `?token=` and is read once when the link connects: a new token needs a new link. On reconnect, live iterators reject, so subscribers re-subscribe.
- TanStack Query: `liveOptions` replaces data with each event (lists); `streamedOptions` accumulates them.

## Tests

- `bun --bun vitest run`: on Node, `bun:sqlite` imports fail with `Received protocol 'bun:'`.
- Vitest transforms `import.meta`, so `import.meta.dir` is undefined in tests; use `import.meta.dirname` or `new URL(…, import.meta.url)`.
- `it.effect` runs on `TestClock`. A shared live server uses `it.layer(layer, { excludeTestServices: true })`, inside which there is no `it.live`.
