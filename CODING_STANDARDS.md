# Coding standards

Lint, format and types are checked by `bun run check`; these are the judgement calls a reviewer makes.

## Server boundary

Balcony listens on the LAN and holds a token that reads every agent transcript. At each entry point in `apps/server`:

- **Origin and Host checked.** Every WebSocket upgrade and every HTTP route that does more than serve the built web app passes `allowedHost` and `allowedOrigin` (`server.ts`), so neither another site's page nor DNS rebinding reaches it.
- **Ids stay data.** An id from a request (session, transcript, pid) is looked up among names read from disk, never joined into a file path.
- **Parsing fails closed.** Untrusted input is decoded with Effect Schema into a typed error or a 4xx; a malformed request never surfaces as a thrown exception, stack or 500.
- **Token by default.** Every new oRPC procedure uses the `authed` middleware. Only `pairing.exchange` is public; another exception needs an ADR.
