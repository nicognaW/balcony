#!/bin/sh
# Agent Stop hook (.claude/settings.json, .codex/hooks.json): runs
# `bun run test` when TypeScript changed since the last commit, and sends the
# agent back once with the failures (exit 2, report on stderr).
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
[ -d "$root/node_modules" ] || exit 0

# Already sent back once this turn: let it stop.
if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

[ -n "$(git -C "$root" status --porcelain -- '*.ts' '*.tsx')" ] || exit 0

if output=$(cd "$root" && bun run test 2>&1); then
  exit 0
fi

{
  echo "bun run test failed, fix it before finishing:"
  echo
  printf '%s\n' "$output" | tail -n 80
} >&2
exit 2
