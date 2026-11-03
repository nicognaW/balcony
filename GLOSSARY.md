# Balcony

Lets the user follow their coding agents and send them messages from a phone browser while away from the desk.

## Language

**Agent**:
One of the coding assistants the user runs on the workstation: Claude (desktop app), Codex (desktop app) or pi (in Kitty).
_Avoid_: bot, assistant, tool

**Session**:
One conversation with an agent, such as a Claude desktop session, a Codex thread or a pi window. It is the unit the phone lists.
_Avoid_: thread, chat, conversation, tab

**Transcript**:
What a session has said and done: user and agent text, files the agent edited, and subagents it started. File contents are not part of it.
_Avoid_: log, history

**Working**:
The state of an agent that is in the middle of a turn.
_Avoid_: busy, running, active

**Settled**:
A session the user has marked as dealt with, so it moves out of the main list until it has new activity.
_Avoid_: archived, done, dismissed

**Done**:
A session that finished a turn after the user last looked at it.
_Avoid_: unread, finished, completed

**Waiting**:
The state of an agent that has finished its turn and is ready for the user's next message.
_Avoid_: idle, done, needs attention

**View-only session**:
A session the phone shows but cannot send messages to.
_Avoid_: read-only, locked

**Message**:
Text the user sends from the phone to an agent, treated as the user's next turn.
_Avoid_: reply, command, prompt, intervention
