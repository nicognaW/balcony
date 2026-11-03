# Read the agents' own files; no hooks or patches, pi extension only

Balcony observes Claude Code and Codex (desktop apps and CLI) only by reading the session and transcript files they already write. It adds no hooks or config changes and never patches the apps, so stopping Balcony can't break the user's setup. Hooks were rejected because, now that Claude and Codex are view-only, they would only improve status reliability. They can't deliver a message that the apps show as an ordinary user message: a hook can only block the end of a turn and return "hook feedback". Patching the signed macOS app bundles was rejected because it breaks on every update. pi is the one exception: it gets a single extension file, because sending a message needs code running inside pi, and pi is built to be extended.

## Consequences

- Claude's live-status file is undocumented. Status may go wrong after an app update, so status is cross-checked against the transcript.
- Claude and Codex sessions are view-only until a sanctioned way to send an ordinary user message exists. When one does (for example Claude's cross-session inbox, if it ever renders as a normal user message), it gets added beside the existing read path without changing it.
