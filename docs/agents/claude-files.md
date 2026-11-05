# Claude's on-disk files

What `apps/server/src/agents/claude/` reads, as Claude Code 2.1.317 wrote it (Linux; macOS not observed). Undocumented: some of it comes from string inspection of Claude's binary rather than files on disk, and any update can change it. Balcony only reads these files (ADR-0001). The fixtures in `apps/server/test/fixtures` (`generate.py`, `manifest.json`) are synthetic copies of real lines; extend them when a new shape shows up.

## Secrets

`~/.claude/sessions/<pid>.<sha256>.key` is Claude's peer-messaging token. Never open, list or serve it. Status records are only names matching `^\d+\.json$` whose number reads back the same (`statusFilePid`).

## Layout

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl     the Transcript; list depth 1 only
~/.claude/projects/<encoded-cwd>/<sessionId>/          subagents/agent-<id>.jsonl (isSidechain), tool-results/, custom-title.json
~/.claude/sessions/<pid>.json                          live status record
```

The folder name is `cwd` with every non-alphanumeric character replaced by `-` (cut at 200 chars plus a hash): lossy, so take the cwd from the lines' `cwd` field. One sessionId can sit in several project folders (it moved, or was teleported).

## Transcript lines

- Append-only JSONL; the last line may be half-written. Skip lines that don't parse and unknown `type`s.
- Lines are not ordered by `timestamp`: take the max, never the last line's.
- Bookkeeping lines (`mode`, `cost-state`, `last-prompt`, `tools-used`, `queue-operation`, …) trail every turn, mostly without timestamps, so file mtime overstates activity.
- One agent API message is written as one line per content block (`thinking`, `text`, `tool_use`), all sharing `message.id` and the same final `stop_reason`. An interrupted stream leaves a line with `stop_reason: null`.
- `toolUseResult` can be an object, a string or an array; `tool_result.content` a string or blocks.
- A `user` line is the human only when it isn't a tool result, `isMeta`, `isCompactSummary`, a `<command-…>`/`<local-command-…>`/`<bash-…>` wrapper, or `origin.kind` `task-notification` or `peer` (subagent hand-backs and harness notices).

## Turn end

Without a trusted status record, the last `user` or `assistant` line decides:

| last line                                                                               | state                                                    |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `assistant`, `stop_reason` `end_turn` / `max_tokens` / `stop_sequence` / `refusal`      | Waiting                                                  |
| `user` `[Request interrupted by user]` (or `… for tool use]`)                           | Waiting                                                  |
| `assistant` `tool_use`; a tool result or prompt with nothing after; `stop_reason: null` | Working, until the line is older than `CRASHED_AFTER_MS` |

Claude writes nothing while a tool runs or the model works on its first block, so a permission prompt and a long command look the same. A parent with background subagents still running ends its turn and is woken later by a task notification.

## Status records

- Written at process start, rewritten (read-merge-write) on every status, session or cwd change, deleted on exit. A crash or SIGKILL leaves a stale record; a write can be torn. Trust a record only if it parses, its pid matches the name and is alive.
- `sessionId` is the process's current session and changes in place on `/clear` and `/resume`: map it afresh on every read.
- `status`: `busy` and `shell` are Working, `idle` is Waiting, `waiting` (with `waitingFor`: a dialog, a question) is blocked on the user, so Waiting. Anything else: fall back to the transcript.
- Times are epoch ms. `name` is the process's display name, not a session title.
