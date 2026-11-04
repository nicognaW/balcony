// The oRPC contract shared by the server and its clients. It depends only on
// @orpc/contract and effect, so the web and mobile apps can import it.
import { asyncIteratorObject, oc } from "@orpc/contract";
import type { RouterContractClient } from "@orpc/contract";
import { Schema } from "effect";

import { transcriptContract } from "./transcript.ts";

export {
  AgentTextEntry,
  CommandRunEntry,
  FileChangeEntry,
  OtherStepEntry,
  SubagentStartedEntry,
  TRANSCRIPT_PAGE_SIZE,
  TranscriptEntry,
  TranscriptPage,
  TranscriptPageInput,
  TranscriptUpdate,
  TranscriptWatchInput,
  UserMessageEntry,
} from "./transcript.ts";

// Wire schemas stay JSON-shaped (no decoding transforms): oRPC validates the
// server's outputs too, so a transform would run against handler results.
const std = Schema.toStandardSchemaV1;

/** The coding assistants Balcony can observe. Codex and pi come later. */
export const Agent = Schema.Literals(["claude"]);

export type Agent = typeof Agent.Type;

/** Working: in the middle of a turn. Waiting: ready for the user. */
export const SessionStatus = Schema.Literals(["working", "waiting"]);

export type SessionStatus = typeof SessionStatus.Type;

/** An ISO-8601 time, or null when the session has none yet. */
const Time = Schema.NullOr(Schema.String);

export const Session = Schema.Struct({
  agent: Agent,
  /** The branch the session works on; null outside a repository or when detached. */
  branch: Schema.NullOr(Schema.String),
  /** Unique across agents. */
  id: Schema.String,
  /** ISO-8601 time of the last user or agent message. */
  lastMessageAt: Schema.String,
  /** When the user last sent the agent a message. */
  lastUserMessageAt: Time,
  /** When the user last opened the session on any client; null if never. */
  lastViewedAt: Time,
  /** Label for the session's working directory, e.g. its folder name. */
  project: Schema.String,
  /**
   * When the user settled the session; null when it isn't Settled, including
   * once new activity has un-settled it.
   */
  settledAt: Time,
  status: SessionStatus,
  title: Schema.String,
  /** When the agent last finished a turn. */
  turnEndedAt: Time,
  /**
   * When the agent's latest turn began: the user's message, or whatever else
   * woke the agent (a finished background task, another session).
   */
  turnStartedAt: Time,
  /** When the user last un-settled the session by hand. */
  unsettledAt: Time,
});

export type Session = typeof Session.Type;

/** The fields Balcony keeps itself; the rest come from the agent's files. */
export type SessionMarks = Pick<
  Session,
  "lastViewedAt" | "settledAt" | "unsettledAt"
>;

/** Names one session. */
export const SessionRef = Schema.Struct({ id: Schema.String });

export type SessionRef = typeof SessionRef.Type;

/** The whole session list. Each event replaces the previous one. */
export const SessionList = Schema.Struct({
  sessions: Schema.Array(Session),
});

export type SessionList = typeof SessionList.Type;

/** The short pairing code `balcony` shows, typed in on the phone. */
export const PairingCodeInput = Schema.Struct({ code: Schema.String });

export type PairingCodeInput = typeof PairingCodeInput.Type;

/** The long-lived token the short code is exchanged for. */
export const PairingToken = Schema.Struct({ token: Schema.String });

export type PairingToken = typeof PairingToken.Type;

/**
 * Why a short code was refused. WRONG: not the code on the Mac (`attemptsLeft`
 * more tries). EXPIRED: no code is live, because it timed out or was already
 * used. LOCKED: too many wrong tries. Expired and locked codes need a new code
 * from the Mac.
 */
export const pairingErrors = {
  PAIRING_CODE_EXPIRED: { message: "The pairing code has expired." },
  PAIRING_CODE_LOCKED: { message: "Too many wrong pairing codes." },
  PAIRING_CODE_WRONG: {
    data: std(Schema.Struct({ attemptsLeft: Schema.Number })),
    message: "That isn't the pairing code.",
  },
} as const;

/**
 * The text frame a client sends on its socket to check the server is still
 * there, and the server's answer. They travel outside oRPC's messages (the
 * client's link ignores frames it can't decode), so any socket can use them.
 */
export const PING = "ping";
export const PONG = "pong";

export const contract = {
  pairing: {
    /** Exchanges the short code for the token. Needs no token itself. */
    exchange: oc
      .errors(pairingErrors)
      .input(std(PairingCodeInput))
      .output(std(PairingToken)),
  },
  sessions: {
    /**
     * Records that the user opened the session now, which clears Done on
     * every client. Call it on opening a session and while it stays open.
     */
    markViewed: oc.input(std(SessionRef)),
    /** Moves the session to Settled until it has new activity. Claude is not told. */
    settle: oc.input(std(SessionRef)),
    /** Moves a Settled session back to the main list. */
    unsettle: oc.input(std(SessionRef)),
    /** The current session list, then a new list on every change. */
    watch: oc.output(asyncIteratorObject(std(SessionList))),
  },
  transcript: transcriptContract,
};

export type Contract = typeof contract;

export type BalconyClient = RouterContractClient<Contract>;
