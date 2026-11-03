# Tooling

uncheck is the only runner: sherif, oxlint, oxfmt, then `tsc -p` on every `tsconfig.json` it finds. Ultracite generated the oxlint/oxfmt config once; its commands are not used.

Tests: `bun run test` runs each workspace's `test` script (`bun --bun vitest run`; Vitest must run on the Bun runtime). It isn't part of uncheck.

## Lint exceptions

- **`no-redeclare` is off** (root `oxlint.config.ts`). Effect Schema declares a schema and its type under one name (`const Session = Schema.Struct(…)` + `type Session = typeof Session.Type`); TypeScript already rejects real redeclarations. No other rule is relaxed: name `Effect.gen` generators (`function* listSessions()`) for `func-names`, and parse untyped input with Effect Schema rather than `typeof` checks for anti-slop.
- **`generatedFiles`** (exported from `oxlint.config.ts`, reused by `oxfmt.config.ts`) skips lint and format for `routeTree.gen.ts`, `uniwind-types.d.ts` and `apps/server/test/fixtures/**`. Uniwind's Metro plugin rewrites `apps/mobile/uniwind-types.d.ts` on every bundle; formatting it drops its `export {}`, which turns the module augmentation into a declaration that hides `uniwind`'s real exports. Patterns are `**/…` because oxlint reads them relative to each workspace's config. The fixtures are copies of Claude's files, some deliberately torn, and formatting would rewrite them.
- **Token in localStorage** (`apps/web/src/lib/pairing.ts`): one inline disable of `react-doctor/auth-token-in-web-storage`, reasoned in that file.

## Gotchas

- **Mobile (Expo).** `apps/mobile` runs Expo CLI and Metro on Node (`bun run --filter @balcony/mobile bundle` bundles; `prebuild` generates the ignored `android/`). Its tsconfig adds `DOM` (as Expo's base config does) so `@balcony/client`'s WebSocket and URL type-check, and `customConditions: ["react-native"]`. Pin Expo-managed packages to the versions in `expo/bundledNativeModules.json`. The APK is built by `.github/workflows/android-apk.yml`.

- **Shared React hooks.** `@balcony/client/react` holds what both apps use: the paired connection (`PairedContext`, `usePaired`, `connectTo`, `pairWithCode`), the session list, marks, connection state, Transcript paging (`useTranscript`) and the query client. React and TanStack Query are peer dependencies of `@balcony/client` (and dev dependencies, for tsc and tests), so each app's single hoisted copy is used; the root entry stays React-free for the server's tests. `packages/client/oxlint.config.ts` adds React's rules for it.
- **react-doctor pin.** `react-doctor` and `oxlint-plugin-react-doctor` are both pinned to the same exact version, so one copy installs. react-doctor depends (not peer) on `oxlint <1.82` and `typescript <6`, so it carries its own oxlint and TypeScript next to the root ones. `bun run doctor` and `bun run check` can disagree for that reason.
- **Empty workspaces.** A workspace with no source files keeps `"references": []` in its tsconfig so tsc skips the "no inputs" error (TS18003). Remove it once the workspace has files.
- **Per-workspace lint.** Oxlint uses each file's nearest config only. React workspaces build theirs with `reactWorkspace(...)` from the root `oxlint.config.ts`; React-only plugins stay out of the root config.
- **Stop hooks.** `.claude/settings.json` and `.codex/hooks.json` hold the same hand-edited command, which exits 0 when `node_modules` is missing. `uncheck hooks install` no longer recognises it and would add a second entry; edit the command by hand.
- **Codex.** Codex runs `.codex/hooks.json` only in a trusted project, after the hook is trusted at its "Hooks need review" prompt.
