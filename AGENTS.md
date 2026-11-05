## Agent skills

### Issue tracker

GitHub Issues on nicognaW/balcony. Before any `gh` call, read `docs/agents/issue-tracker.md` (cloud sessions: REST only).

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Reference

- Effect, oRPC or Drizzle code, or bumping their versions: read `docs/agents/stack.md` first.
- Reading Claude's `~/.claude` files (`apps/server/src/agents/claude`): read `docs/agents/claude-files.md` first.

## Commits

Cloud sessions: the stop hook's "Unverified" warning is expected; leave commits as authored.

## Checks

`bun run check` / `bun run fix` (uncheck). Before changing lint, format, type or hook config, read `docs/agents/tooling.md`.
