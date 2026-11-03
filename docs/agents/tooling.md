# Tooling

uncheck is the only runner: sherif, oxlint, oxfmt, then `tsc -p` on every `tsconfig.json` it finds. Ultracite generated the oxlint/oxfmt config once; its commands are not used.

## Gotchas

- **react-doctor pin.** `react-doctor` and `oxlint-plugin-react-doctor` are both pinned to the same exact version, so one copy installs. react-doctor depends (not peer) on `oxlint <1.82` and `typescript <6`, so it carries its own oxlint and TypeScript next to the root ones. `bun run doctor` and `bun run check` can disagree for that reason.
- **Empty workspaces.** A workspace with no source files keeps `"references": []` in its tsconfig so tsc skips the "no inputs" error (TS18003). Remove it once the workspace has files.
- **Per-workspace lint.** Oxlint uses each file's nearest config only. React workspaces build theirs with `reactWorkspace(...)` from the root `oxlint.config.ts`; React-only plugins stay out of the root config.
- **Stop hooks.** `.claude/settings.json` and `.codex/hooks.json` hold the same hand-edited command, which exits 0 when `node_modules` is missing. `uncheck hooks install` no longer recognises it and would add a second entry; edit the command by hand.
- **Codex.** Codex runs `.codex/hooks.json` only in a trusted project, after the hook is trusted at its "Hooks need review" prompt.
- **No AI attribution.** `.claude/settings.json` sets empty commit and PR attribution. Cloud sessions still add a footer to GitHub posts, so `.github/workflows/strip-ai-footer.yml` removes it from issues, PRs, reviews and comments. The `commit-messages` job in `check.yml` fails on attribution trailers in history.
