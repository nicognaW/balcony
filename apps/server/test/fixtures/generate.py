"""Generate sanitised Claude Code fixture files for Balcony.

Entry shapes are copied from real Claude Code 2.1.317 transcripts on this
machine (field names, nesting, ordering of metadata lines); all content
(prompts, replies, commands, paths, ids) is synthetic.

All timestamps are relative to FIXTURE_NOW. Tests shift them (see claude-files.md).
"""

import json
import os
import shutil
import sys
import uuid as uuidlib
from datetime import datetime, timedelta, timezone

OUT = sys.argv[1]
FIXTURE_NOW = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
VERSION = "2.1.317"
HOME = "/Users/nico"

_ns = uuidlib.UUID("6f1c2a2e-0000-4000-8000-000000000000")
_counter = [0]


def uid():
    _counter[0] += 1
    return str(uuidlib.uuid5(_ns, str(_counter[0])))


def hexid(prefix, n=24):
    _counter[0] += 1
    return prefix + uuidlib.uuid5(_ns, "h" + str(_counter[0])).hex[:n]


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def ms(dt):
    return int(dt.timestamp() * 1000)


def encode_cwd(cwd):
    import re

    return re.sub(r"[^a-zA-Z0-9]", "-", cwd)


def usage(out_tokens=120):
    return {
        "input_tokens": 2,
        "cache_creation_input_tokens": 812,
        "cache_read_input_tokens": 40211,
        "output_tokens": out_tokens,
        "output_tokens_details": {"thinking_tokens": 0},
        "server_tool_use": {"web_search_requests": 0, "web_fetch_requests": 0},
        "service_tier": "standard",
        "cache_creation": {"ephemeral_1h_input_tokens": 812, "ephemeral_5m_input_tokens": 0},
        "inference_geo": "global",
        "iterations": [
            {
                "input_tokens": 2,
                "output_tokens": out_tokens,
                "cache_read_input_tokens": 40211,
                "cache_creation_input_tokens": 812,
                "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 812},
                "type": "message",
            }
        ],
        "speed": "standard",
        "fallback_credit": None,
    }


class Session:
    def __init__(self, sid, cwd, branch, entrypoint, start, sidechain_agent=None):
        self.sid = sid
        self.cwd = cwd
        self.branch = branch
        self.entrypoint = entrypoint
        self.t = start
        self.lines = []
        self.parent = None
        self.prompt_id = None
        self.prompt_index = 0
        self.agent_id = sidechain_agent
        self.tools_used = []

    # -- clock -------------------------------------------------------------
    def tick(self, seconds=1.0):
        self.t = self.t + timedelta(seconds=seconds)
        return self.t

    def at(self, dt):
        self.t = dt

    # -- envelopes ---------------------------------------------------------
    def env_tail(self):
        return {
            "userType": "external",
            "entrypoint": self.entrypoint,
            "cwd": self.cwd,
            "sessionId": self.sid,
            "version": VERSION,
            "gitBranch": self.branch,
        }

    def head(self, extra_first=None):
        d = {"parentUuid": self.parent, "isSidechain": self.agent_id is not None}
        if self.agent_id is not None:
            d["agentId"] = self.agent_id
        if extra_first:
            d.update(extra_first)
        return d

    def emit(self, obj, chain=True):
        self.lines.append(obj)
        if chain and "uuid" in obj:
            self.parent = obj["uuid"]
        return obj

    # -- metadata lines (no uuid / timestamp) --------------------------------
    def meta(self, obj):
        self.lines.append(obj)

    def mode(self):
        self.meta({"type": "mode", "mode": "normal", "sessionId": self.sid})

    def queue(self, content):
        self.meta({"type": "queue-operation", "operation": "enqueue", "timestamp": iso(self.tick(0.01)), "sessionId": self.sid, "content": content})
        self.meta({"type": "queue-operation", "operation": "dequeue", "timestamp": iso(self.tick(0.001)), "sessionId": self.sid})

    def turn_footer(self, last_prompt, leaf):
        self.meta({"type": "atis-latch", "atis": "", "sessionId": self.sid})
        self.meta({"type": "mode", "mode": "normal", "sessionId": self.sid})
        self.meta({"type": "tools-used", "tools": sorted(set(self.tools_used)), "sessionId": self.sid})
        self.meta({"type": "last-prompt", "lastPrompt": last_prompt, "leafUuid": leaf, "sessionId": self.sid})

    # -- entries -----------------------------------------------------------
    def user_prompt(self, text, gap=20.0, queued=True):
        self.prompt_index += 1
        if queued and self.agent_id is None:
            self.tick(gap)
            self.queue(text)
        else:
            self.tick(gap)
        self.prompt_id = uid()
        u = uid()
        d = self.head({"promptId": self.prompt_id, "type": "user"})
        d.update(
            {
                "message": {"role": "user", "content": text},
                "uuid": u,
                "timestamp": iso(self.tick(0.02)),
            }
        )
        if self.agent_id is None:
            d.update(
                {
                    "permissionMode": "default",
                    "origin": {"kind": "human"},
                    "promptSource": "sdk" if self.entrypoint == "claude-desktop" else "repl",
                    "turnOrigin": "human",
                    "turnPosition": {"promptIndex": self.prompt_index, "turnIndex": self.prompt_index},
                    "clientPlatform": "desktop_app" if self.entrypoint == "claude-desktop" else "cli",
                    "turnAttributionKey": u,
                }
            )
        d.update(self.env_tail())
        self.last_prompt = text
        return self.emit(d)

    def meta_user(self, text):
        d = self.head({"promptId": self.prompt_id, "type": "user"})
        d.update({"message": {"role": "user", "content": [{"type": "text", "text": text}]}, "isMeta": True, "uuid": uid(), "timestamp": iso(self.tick(0.01))})
        d.update(self.env_tail())
        return self.emit(d)

    def attachment(self, att):
        d = self.head({"type": "attachment"})
        d.update({"attachment": att, "uuid": uid(), "timestamp": iso(self.tick(0.01))})
        d.update(self.env_tail())
        return self.emit(d)

    def _assistant(self, msg_id, block, stop_reason, req, gap):
        d = self.head()
        d.update(
            {
                "message": {
                    "model": "claude-opus-5-5",
                    "id": msg_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [block],
                    "container": None,
                    "stop_reason": stop_reason,
                    "stop_sequence": None,
                    "stop_details": None,
                    "usage": usage(),
                    "input_transformations": [],
                    "diagnostics": None,
                    "context_management": None,
                },
                "apiBlockIndex": 1,
                "requestId": req,
                "requestedModel": "claude-opus-5-5",
                "type": "assistant",
                "uuid": uid(),
                "timestamp": iso(self.tick(gap)),
                "advisorModel": "claude-opus-5-5",
                "effort": "medium",
                "perTurnEffort": "medium",
            }
        )
        d.update(self.env_tail())
        return self.emit(d)

    def assistant(self, blocks, stop_reason, think=None, gap=3.0):
        """One API message, written as one JSONL line per content block (as Claude does)."""
        msg_id = hexid("msg_011C", 20)
        req = hexid("req_011C", 20)
        out = []
        if think is not None:
            out.append(self._assistant(msg_id, {"type": "thinking", "thinking": "", "signature": "RklYVFVSRS1TSUdOQVRVUkU="}, stop_reason, req, gap))
            gap = 0.003
        for b in blocks:
            out.append(self._assistant(msg_id, b, stop_reason, req, gap))
            gap = 0.003
        return out

    def text(self, text, end=True, think=False, gap=3.0):
        return self.assistant([{"type": "text", "text": text}], "end_turn" if end else "tool_use", think=True if think else None, gap=gap)

    def tool_use(self, name, inp, think=False, text=None, gap=3.0):
        tid = hexid("toolu_01", 22)
        blocks = []
        if text:
            blocks.append({"type": "text", "text": text})
        blocks.append({"type": "tool_use", "id": tid, "name": name, "input": inp})
        entries = self.assistant(blocks, "tool_use", think=True if think else None, gap=gap)
        self.tools_used.append(name)
        return tid, entries[-1]["uuid"]

    def tool_result(self, tid, src_uuid, content, result, is_error=False, gap=0.5, extra=None):
        block = {"tool_use_id": tid, "type": "tool_result", "content": content}
        if is_error or isinstance(content, str):
            block["is_error"] = is_error
        d = self.head({"promptId": self.prompt_id, "type": "user"})
        d.update(
            {
                "message": {"role": "user", "content": [block]},
                "uuid": uid(),
                "timestamp": iso(self.tick(gap)),
                "toolUseResult": result,
                "sourceToolAssistantUUID": src_uuid,
            }
        )
        if self.agent_id is None:
            d["permissionDecision"] = {"decision": "accept", "source": "config", "reasonType": "rule", "ruleSource": "userSettings"}
        if extra:
            d.update(extra)
        d.update(self.env_tail())
        return self.emit(d)

    def bash(self, command, stdout, description=None, think=False, exit_code=0):
        inp = {"command": command}
        if description:
            inp["description"] = description
        tid, src = self.tool_use("Bash", inp, think=think)
        if exit_code:
            content = f"Exit code {exit_code}\n{stdout}"
            self.tool_result(tid, src, content, f"Error: {content}", is_error=True, gap=1.2)
        else:
            self.tool_result(tid, src, stdout, {"stdout": stdout, "stderr": "", "interrupted": False, "isImage": False, "noOutputExpected": False}, gap=1.2)

    def read(self, path, content):
        tid, src = self.tool_use("Read", {"file_path": path})
        numbered = "\n".join(f"{i + 1}\t{l}" for i, l in enumerate(content.split("\n")))
        self.tool_result(tid, src, numbered, {"type": "text", "file": {"filePath": path, "content": content, "numLines": content.count("\n") + 1, "startLine": 1, "totalLines": content.count("\n") + 1}})

    def edit(self, path, old, new, original):
        tid, src = self.tool_use("Edit", {"replace_all": False, "file_path": path, "old_string": old, "new_string": new})
        self.tool_result(
            tid,
            src,
            f"The file {path} has been updated successfully. (file state is current in your context — no need to Read it back)",
            {
                "filePath": path,
                "oldString": old,
                "newString": new,
                "originalFile": original,
                "structuredPatch": [{"oldStart": 1, "oldLines": 1, "newStart": 1, "newLines": 1, "lines": ["-" + old, "+" + new]}],
                "userModified": False,
                "replaceAll": False,
            },
            gap=0.03,
        )

    def write(self, path, content):
        tid, src = self.tool_use("Write", {"file_path": path, "content": content})
        self.tool_result(
            tid,
            src,
            f"File created successfully at: {path} (file state is current in your context — no need to Read it back)",
            {"type": "create", "filePath": path, "content": content, "structuredPatch": [], "originalFile": None, "userModified": False},
            gap=0.03,
        )

    def multiedit(self, path, edits):
        tid, src = self.tool_use("MultiEdit", {"file_path": path, "edits": edits})
        self.tool_result(
            tid,
            src,
            f"Applied {len(edits)} edits to {path}",
            {"filePath": path, "edits": edits, "originalFileContents": "…", "structuredPatch": [], "userModified": False},
            gap=0.03,
        )

    def notebook_edit(self, path, cell_id, source):
        tid, src = self.tool_use("NotebookEdit", {"notebook_path": path, "cell_id": cell_id, "new_source": source, "edit_mode": "replace"})
        self.tool_result(tid, src, f"Updated cell {cell_id} with {source}", {"new_source": source, "cell_id": cell_id, "cell_type": "code", "language": "python", "edit_mode": "replace", "error": ""}, gap=0.03)

    def agent(self, description, prompt, subagent_type="general-purpose", background=True):
        inp = {"description": description, "prompt": prompt, "subagent_type": subagent_type}
        if background:
            inp["run_in_background"] = True
        tid, src = self.tool_use("Agent", inp, think=True)
        agent_id = "a" + hexid("", 16)
        self.tool_result(
            tid,
            src,
            [{"type": "text", "text": f"Async agent launched successfully.\nagentId: {agent_id} (internal ID - do not mention to user.)"}],
            {
                "isAsync": True,
                "status": "async_launched",
                "agentId": agent_id,
                "description": description,
                "resolvedModel": "claude-opus-5-5",
                "prompt": prompt,
                "outputFile": f"/private/tmp/claude-501/{encode_cwd(self.cwd)}/{self.sid}/tasks/{agent_id}.output",
                "canReadOutputFile": True,
                "canContinueAgent": True,
            },
            gap=0.2,
        )
        return tid, agent_id

    def interrupted(self, for_tool=False):
        msg = "[Request interrupted by user for tool use]" if for_tool else "[Request interrupted by user]"
        d = self.head({"promptId": self.prompt_id, "type": "user"})
        d.update({"message": {"role": "user", "content": [{"type": "text", "text": msg}]}, "uuid": uid(), "timestamp": iso(self.tick(1.5))})
        d.update(self.env_tail())
        return self.emit(d)

    def stop_hook(self):
        d = self.head({"type": "system", "subtype": "stop_hook_summary"})
        d.update(
            {
                "hookCount": 1,
                "hookInfos": [{"command": "command hook", "durationMs": 13}],
                "hookErrors": [],
                "hookAdditionalContext": [],
                "preventedContinuation": False,
                "stopReason": "",
                "hasOutput": False,
                "level": "suggestion",
                "timestamp": iso(self.tick(0.15)),
                "uuid": uid(),
                "toolUseID": uid(),
            }
        )
        d.update(self.env_tail())
        return self.emit(d)

    def end_turn(self):
        """Lines Claude appends after an end_turn assistant message."""
        leaf = self.parent
        self.stop_hook()
        self.turn_footer(self.last_prompt, leaf)

    def write_to(self, home):
        d = os.path.join(home, ".claude", "projects", encode_cwd(self.cwd))
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, f"{self.sid}.jsonl")
        with open(p, "w") as f:
            for l in self.lines:
                f.write(json.dumps(l, ensure_ascii=False, separators=(",", ":")) + "\n")
        return p


def status_file(home, pid, sid, cwd, started, updated, status, entrypoint, name, extra=None):
    d = os.path.join(home, ".claude", "sessions")
    os.makedirs(d, exist_ok=True)
    obj = {
        "pid": pid,
        "sessionId": sid,
        "cwd": cwd,
        "startedAt": ms(started),
        "procStart": "Thu Jan 15 09:00:00 2026",
        "version": VERSION,
        "peerProtocol": 1,
        "peerFeatures": ["notify_idle", "reply_across_default_dirs"],
        "kind": "interactive",
        "entrypoint": entrypoint,
        "pidDomain": "darwin",
        "asksForConvertedSkills": False,
        "messagingSocketPath": f"/private/tmp/cc-socks/{pid}.sock",
        "name": name,
        "nameSource": "derived",
        "nameSince": ms(started),
        "updatedAt": ms(updated),
        "status": status,
        "statusUpdatedAt": ms(updated),
    }
    if extra:
        obj.update(extra)
    with open(os.path.join(d, f"{pid}.json"), "w") as f:
        f.write(json.dumps(obj, separators=(",", ":")))
    return obj


def ago(**kw):
    return FIXTURE_NOW - timedelta(**kw)


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    home = os.path.join(OUT, "home")
    manifest = {"fixtureNow": iso(FIXTURE_NOW), "home": "home", "sessions": {}, "statusFiles": {}}

    BALCONY = f"{HOME}/code/balcony"
    SHOP = f"{HOME}/code/shop-api"
    NOTES = f"{HOME}/code/notes.site"

    # 1. Working: mid-turn, last line is a Bash tool_use with no result yet. Live status file says busy.
    s = Session("0b6f6a3e-1c55-4d0e-9a51-2f3c1d7e9a01", BALCONY, "main", "claude-desktop", ago(minutes=6))
    s.mode()
    s.user_prompt("Run the test suite and fix whatever fails.", gap=0)
    s.text("I'll start by running the tests to see what's failing.", end=False, think=True)
    s.bash("bun test", "12 pass\n1 fail\n  ✗ session list > hides sessions older than 24h", description="Run the test suite")
    s.read(f"{BALCONY}/apps/server/src/sessions.ts", "export const WINDOW_MS = 24 * 60 * 60 * 1000;\n")
    s.edit(f"{BALCONY}/apps/server/src/sessions.ts", "lastMessageAt > now - WINDOW_MS", "lastMessageAt >= now - WINDOW_MS", "…")
    s.at(ago(seconds=40))
    s.tool_use("Bash", {"command": "bun test", "description": "Re-run the test suite"}, think=True)
    p = s.write_to(home)
    status_file(home, 41001, s.sid, BALCONY, ago(minutes=7), ago(seconds=40), "busy", "claude-desktop", "balcony-fix-tests")
    manifest["sessions"]["working"] = {"sessionId": s.sid, "path": os.path.relpath(p, OUT), "expect": {"listed": True, "status": "Working", "statusSource": "statusFile", "project": "balcony", "title": "Run the test suite and fix whatever fails.", "branch": "main", "lastMessageAt": s.lines[-1]["timestamp"]}}
    manifest["statusFiles"]["41001.json"] = {"pid": "live", "sessionId": s.sid}

    # 2. Waiting: turn ended (end_turn) + stop hook + footer. Live status file says idle.
    s = Session("1c7e8b4f-2d66-4e1f-8b62-3a4d2e8f0b02", SHOP, "feature/rate-limit", "cli", ago(minutes=50))
    s.mode()
    s.user_prompt("What does the rate limiter do when Redis is down?", gap=0)
    gtid, gsrc = s.tool_use("Grep", {"pattern": "rateLimit", "path": f"{SHOP}/src"}, think=True)
    s.tool_result(gtid, gsrc, "Found 2 files\nsrc/middleware/rate-limit.ts\nsrc/redis.ts", {"mode": "files_with_matches", "filenames": ["src/middleware/rate-limit.ts", "src/redis.ts"], "numFiles": 2})
    s.read(f"{SHOP}/src/middleware/rate-limit.ts", "try { await redis.incr(key) } catch { return next() }")
    s.at(ago(minutes=12))
    s.text("It **fails open**: if the `INCR` call throws, the middleware calls `next()` and the request goes through unthrottled.\n\n- `src/middleware/rate-limit.ts:14` catches the error\n- nothing is logged\n\nWant me to add a log line and a metric?", end=True, think=True)
    s.end_turn()
    p = s.write_to(home)
    status_file(home, 41002, s.sid, SHOP, ago(minutes=51), ago(minutes=12), "idle", "cli", "shop-api-redis")
    manifest["sessions"]["waiting"] = {"sessionId": s.sid, "path": os.path.relpath(p, OUT), "expect": {"listed": True, "status": "Waiting", "statusSource": "statusFile", "project": "shop-api", "title": "What does the rate limiter do when Redis is down?", "branch": "feature/rate-limit"}}
    manifest["statusFiles"]["41002.json"] = {"pid": "live", "sessionId": s.sid}

    # 3. Tools: file changes (Write, Edit, MultiEdit, NotebookEdit), subagent (Agent), bash. Process exited:
    #    a stale status file (dead pid) still says busy -> must be ignored -> transcript says Waiting.
    s = Session("2d8f9c50-3e77-4f20-9c73-4b5e3f901c03", BALCONY, "ticket-4", "claude-desktop", ago(hours=2))
    s.mode()
    s.user_prompt("Add a fixture loader for the server tests and get a reviewer subagent to check it.", gap=0)
    s.text("Plan: write the loader, wire it into the test setup, then ask a subagent to review.", end=False, think=True)
    s.write(f"{BALCONY}/apps/server/test/fixtures.ts", "export const loadFixtureHome = async () => {};\n")
    s.edit(f"{BALCONY}/apps/server/test/setup.ts", "// setup", "import { loadFixtureHome } from './fixtures';", "// setup\n")
    s.multiedit(f"{BALCONY}/apps/server/package.json", [{"old_string": '"test": "vitest"', "new_string": '"test": "vitest run"'}, {"old_string": '"private": false', "new_string": '"private": true'}])
    s.notebook_edit(f"{BALCONY}/docs/explore.ipynb", "cell-3", "print(len(sessions))")
    s.bash("bunx vitest run apps/server", "Test Files  3 passed (3)\n     Tests  14 passed (14)", description="Run server tests")
    s.bash("git push origin ticket-4", "remote: Permission denied", description="Push branch", exit_code=1)
    tid, agent_id = s.agent("Review fixture loader", "Review apps/server/test/fixtures.ts for correctness. Report findings only.", subagent_type="general-purpose", background=True)
    s.text("The loader is in place and tests pass. A reviewer subagent is checking it now; the push failed (permission denied), so the branch is local only.", end=True)
    s.end_turn()
    # subagent hand-back arrives later as a task-notification queued_command attachment, then a new turn
    s.tick(90)
    s.attachment({"type": "queued_command", "prompt": f"<task-notification>\n<task-id>{agent_id}</task-id>\n<tool-use-id>{tid}</tool-use-id>\n<status>completed</status>\n<summary>Agent \"Review fixture loader\" completed</summary>\n</task-notification>", "source_uuid": uid(), "delivery_id": uid(), "commandMode": "task-notification", "origin": {"kind": "task-notification", "producer": "session-task"}, "timestamp": iso(s.t)})
    s.at(ago(minutes=95))
    s.text("The reviewer found no problems with the loader.", end=True)
    s.end_turn()
    p = s.write_to(home)
    # subagent transcript (sidechain) - must NOT be listed as a session
    sub = Session(s.sid, BALCONY, "ticket-4", "claude-desktop", ago(minutes=98), sidechain_agent=agent_id)
    sub.user_prompt("Review apps/server/test/fixtures.ts for correctness. Report findings only.", gap=0, queued=False)
    sub.read(f"{BALCONY}/apps/server/test/fixtures.ts", "export const loadFixtureHome = async () => {};\n")
    sub.text("No problems found.", end=True)
    sd = os.path.join(home, ".claude", "projects", encode_cwd(BALCONY), s.sid, "subagents")
    os.makedirs(sd, exist_ok=True)
    with open(os.path.join(sd, f"agent-{agent_id}.jsonl"), "w") as f:
        for l in sub.lines:
            f.write(json.dumps(l, ensure_ascii=False, separators=(",", ":")) + "\n")
    with open(os.path.join(sd, f"agent-{agent_id}.meta.json"), "w") as f:
        json.dump({"agentType": "general-purpose", "isBuiltIn": True, "description": "Review fixture loader", "toolUseId": tid, "spawnDepth": 1, "requestShape": "background", "requestNonInteractive": True, "pickedEffortModel": "claude-opus-5-5", "finished": True}, f, separators=(",", ":"))
    status_file(home, 41003, s.sid, BALCONY, ago(hours=2, minutes=1), ago(minutes=99), "busy", "claude-desktop", "balcony-fixture-loader")
    manifest["sessions"]["tools"] = {
        "sessionId": s.sid,
        "path": os.path.relpath(p, OUT),
        "subagentTranscript": os.path.relpath(os.path.join(sd, f"agent-{agent_id}.jsonl"), OUT),
        "expect": {
            "listed": True,
            "status": "Waiting",
            "statusSource": "transcript (status file pid is dead)",
            "project": "balcony",
            "branch": "ticket-4",
            "fileChanges": [f"{BALCONY}/apps/server/test/fixtures.ts", f"{BALCONY}/apps/server/test/setup.ts", f"{BALCONY}/apps/server/package.json", f"{BALCONY}/docs/explore.ipynb"],
            "subagents": ["Review fixture loader"],
            "commands": ["bunx vitest run apps/server", "git push origin ticket-4"],
        },
    }
    manifest["statusFiles"]["41003.json"] = {"pid": "dead", "sessionId": s.sid, "note": "stale record left by a crashed process; claims busy"}

    # 4. Long: > 40 normalised entries for paging. No status file (process gone). Includes an interrupt.
    s = Session("3e90ad61-4f88-4031-8d84-5c6f40a12d04", NOTES, "main", "cli", ago(hours=5))
    s.mode()
    for i in range(1, 19):
        s.user_prompt(f"Step {i}: tidy up post {i:02d} front matter.", gap=60 if i > 1 else 0)
        s.text(f"Checking post {i:02d}.", end=False)
        s.bash(f"head -5 content/posts/{i:02d}.md", f"---\ntitle: Post {i}\n---", description=f"Show front matter of post {i}")
        if i == 9:
            btid, bsrc = s.tool_use("Bash", {"command": "bun run build", "description": "Build the site"})
            rej = "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
            s.tool_result(btid, bsrc, rej, "Error: " + rej, is_error=True, gap=4.0, extra={"toolDenialKind": "interrupted"})
            s.interrupted(for_tool=True)
            continue
        s.edit(f"{NOTES}/content/posts/{i:02d}.md", f"title: Post {i}", f'title: "Post {i}"', "…")
        s.text(f"Quoted the title of post {i:02d}.", end=True)
        s.end_turn()
    s.at(ago(hours=3))
    s.user_prompt("Thanks, that's all.", gap=0)
    s.text("You're welcome.", end=True)
    s.end_turn()
    p = s.write_to(home)
    manifest["sessions"]["long"] = {"sessionId": s.sid, "path": os.path.relpath(p, OUT), "expect": {"listed": True, "status": "Waiting", "statusSource": "transcript", "project": "notes.site", "title": "Step 1: tidy up post 01 front matter.", "minNormalisedEntries": 41}}

    # 5. Old: last message 26h ago -> not listed.
    s = Session("4fa1be72-5099-4142-9e95-6d7051b23e05", SHOP, "main", "cli", ago(hours=27))
    s.mode()
    s.user_prompt("Bump the Node version in CI to 24.", gap=0)
    s.edit(f"{SHOP}/.github/workflows/ci.yml", "node-version: 22", "node-version: 24", "…")
    s.at(ago(hours=26))
    s.text("Done: CI now uses Node 24.", end=True)
    s.end_turn()
    p = s.write_to(home)
    manifest["sessions"]["old"] = {"sessionId": s.sid, "path": os.path.relpath(p, OUT), "expect": {"listed": False, "reason": "last message 26h before fixtureNow"}}

    # 6. Started 3 days ago, messaged 30 minutes ago -> listed. Has an ai-title entry (title source).
    s = Session("5ab2cf83-61aa-4253-8fa6-7e8162c34f06", BALCONY, "main", "claude-desktop", ago(days=3))
    s.mode()
    s.user_prompt("Let's design the pairing flow.", gap=0)
    s.text("Here's a first sketch: a QR code carrying the server URL and a token, plus a short code fallback.", end=True, think=True)
    s.end_turn()
    s.meta({"type": "ai-title", "aiTitle": "Design the pairing flow", "sessionId": s.sid})
    s.at(ago(minutes=31))
    s.user_prompt("How long should the short code stay valid?", gap=0)
    s.at(ago(minutes=30))
    s.text("Ten minutes, with at most five attempts.", end=True)
    s.end_turn()
    p = s.write_to(home)
    manifest["sessions"]["longRunning"] = {"sessionId": s.sid, "path": os.path.relpath(p, OUT), "expect": {"listed": True, "status": "Waiting", "statusSource": "transcript", "title": "Design the pairing flow", "titleSource": "ai-title (synthetic: entry type exists in the 2.1.317 binary, not seen on disk here)", "firstEntryAt": next(l["timestamp"] for l in s.lines if "timestamp" in l)}}

    # 7. Malformed status files. Session is mid-turn per transcript (tool_use, no result) -> Working via fallback.
    s = Session("6bc3d094-72bb-4364-9fb7-8f9273d45f07", SHOP, "fix/flaky-test", "cli", ago(minutes=20))
    s.mode()
    s.user_prompt("Find out why checkout.test.ts is flaky.", gap=0)
    s.bash("bun test checkout --rerun-each 20", "19 pass\n1 fail", description="Rerun checkout tests 20 times")
    s.at(ago(minutes=2))
    s.tool_use("Agent", {"description": "Bisect flaky test", "prompt": "Bisect which commit made checkout.test.ts flaky.", "subagent_type": "general-purpose"}, think=True)
    p = s.write_to(home)
    sd = os.path.join(home, ".claude", "sessions")
    with open(os.path.join(sd, "41007.json"), "w") as f:
        # schema drift: unknown status value
        f.write(json.dumps({"pid": 41007, "sessionId": s.sid, "cwd": SHOP, "startedAt": ms(ago(minutes=21)), "kind": "interactive", "entrypoint": "cli", "updatedAt": ms(ago(minutes=2)), "status": "thinking-hard", "statusUpdatedAt": ms(ago(minutes=2))}, separators=(",", ":")))
    with open(os.path.join(sd, "41008.json"), "w") as f:
        # torn write: truncated JSON
        f.write('{"pid":41008,"sessionId":"6bc3d094-72bb-4364-9fb7-8f9273d45f07","cwd":"/Users/nico/code/shop-a')
    with open(os.path.join(sd, "41007.c0ffee.key"), "w") as f:
        f.write('{"peerToken":"00000000000000000000000000000000"}')
    with open(os.path.join(sd, ".fleetview-heartbeat"), "w") as f:
        f.write(str(ms(ago(seconds=5))))
    manifest["sessions"]["malformedStatus"] = {"sessionId": s.sid, "path": os.path.relpath(p, OUT), "expect": {"listed": True, "status": "Working", "statusSource": "transcript (status files unusable)", "project": "shop-api"}}
    manifest["statusFiles"]["41007.json"] = {"pid": "live", "sessionId": s.sid, "note": "valid JSON, unknown status value 'thinking-hard'"}
    manifest["statusFiles"]["41008.json"] = {"pid": "live", "note": "truncated JSON"}
    manifest["ignoredFiles"] = ["home/.claude/sessions/41007.c0ffee.key", "home/.claude/sessions/.fleetview-heartbeat"]

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


main()
