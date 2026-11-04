// A session's Transcript, normalised into one entry model for every agent.
import { asyncIteratorObject, oc } from "@orpc/contract";
import { Schema } from "effect";

const std = Schema.toStandardSchemaV1;

const entryBase = {
  /** ISO-8601 time the agent recorded it, when known. */
  at: Schema.optional(Schema.String),
  /** Stable and unique within the session's Transcript. */
  id: Schema.String,
};

/** Text the user typed, or a slash command shown as `/name args`. */
export const UserMessageEntry = Schema.Struct({
  ...entryBase,
  kind: Schema.Literal("user-message"),
  text: Schema.String,
});

/** Text the agent wrote, as markdown. */
export const AgentTextEntry = Schema.Struct({
  ...entryBase,
  kind: Schema.Literal("agent-text"),
  text: Schema.String,
});

/** A file the agent wrote or edited: its path, never its contents. */
export const FileChangeEntry = Schema.Struct({
  ...entryBase,
  kind: Schema.Literal("file-change"),
  path: Schema.String,
});

/** A subagent the agent started. */
export const SubagentStartedEntry = Schema.Struct({
  ...entryBase,
  description: Schema.String,
  kind: Schema.Literal("subagent-started"),
  /** The kind of subagent, e.g. `general-purpose`, when the agent says. */
  subagentType: Schema.optional(Schema.String),
});

/** A shell command the agent ran. */
export const CommandRunEntry = Schema.Struct({
  ...entryBase,
  command: Schema.String,
  /** The agent's own one-line summary of the command, when given. */
  description: Schema.optional(Schema.String),
  kind: Schema.Literal("command-run"),
});

/** Any other step: another tool, an interrupt, a notification. */
export const OtherStepEntry = Schema.Struct({
  ...entryBase,
  /** What the step looked at (a path, a pattern, a URL), when known. */
  detail: Schema.optional(Schema.String),
  kind: Schema.Literal("other-step"),
  /** e.g. the tool's name, or "Interrupted". */
  label: Schema.String,
});

/** One normalised Transcript entry. */
export const TranscriptEntry = Schema.Union([
  UserMessageEntry,
  AgentTextEntry,
  FileChangeEntry,
  SubagentStartedEntry,
  CommandRunEntry,
  OtherStepEntry,
]);

export type TranscriptEntry = typeof TranscriptEntry.Type;

/** How many Transcript entries a page holds. */
export const TRANSCRIPT_PAGE_SIZE = 20;

export const TranscriptPageInput = Schema.Struct({
  /** Return the entries just before this entry id; omit for the newest. */
  before: Schema.optional(Schema.String),
  sessionId: Schema.String,
});

export type TranscriptPageInput = typeof TranscriptPageInput.Type;

/** Up to TRANSCRIPT_PAGE_SIZE consecutive entries, oldest first. */
export const TranscriptPage = Schema.Struct({
  entries: Schema.Array(TranscriptEntry),
  /** Whether older entries exist before the first one here. */
  hasEarlier: Schema.Boolean,
});

export type TranscriptPage = typeof TranscriptPage.Type;

export const TranscriptWatchInput = Schema.Struct({
  sessionId: Schema.String,
});

export type TranscriptWatchInput = typeof TranscriptWatchInput.Type;

/**
 * An event of a Transcript watch. `latest` is always the first event: the
 * newest page, replacing whatever the client held. It comes again if the
 * Transcript is rewritten. `appended` adds entries after the last ones sent.
 */
export const TranscriptUpdate = Schema.Union([
  Schema.Struct({
    entries: Schema.Array(TranscriptEntry),
    hasEarlier: Schema.Boolean,
    type: Schema.Literal("latest"),
  }),
  Schema.Struct({
    entries: Schema.Array(TranscriptEntry),
    type: Schema.Literal("appended"),
  }),
]);

export type TranscriptUpdate = typeof TranscriptUpdate.Type;

export const transcriptContract = {
  /**
   * A page of a session's Transcript. Fails with NOT_FOUND for an unknown
   * session or `before` id.
   */
  read: oc.input(std(TranscriptPageInput)).output(std(TranscriptPage)),
  /**
   * The newest page, then entries as they are appended. Fails with
   * NOT_FOUND for an unknown session.
   */
  watch: oc
    .input(std(TranscriptWatchInput))
    .output(asyncIteratorObject(std(TranscriptUpdate))),
};
