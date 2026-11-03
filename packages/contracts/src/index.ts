// The oRPC contract shared by the server and its clients. It depends only on
// @orpc/contract and effect, so the web and mobile apps can import it.
import { asyncIteratorObject, oc } from "@orpc/contract";
import type { RouterContractClient } from "@orpc/contract";
import { Schema } from "effect";

// Wire schemas stay JSON-shaped (no decoding transforms): oRPC validates the
// server's outputs too, so a transform would run against handler results.
const std = Schema.toStandardSchemaV1;

/** The coding assistants Balcony can observe. Codex and pi come later. */
export const Agent = Schema.Literals(["claude"]);

export type Agent = typeof Agent.Type;

/** Working: in the middle of a turn. Waiting: ready for the user. */
export const SessionStatus = Schema.Literals(["working", "waiting"]);

export type SessionStatus = typeof SessionStatus.Type;

export const Session = Schema.Struct({
  agent: Agent,
  /** Unique across agents. */
  id: Schema.String,
  /** ISO-8601 time of the last user or agent message. */
  lastMessageAt: Schema.String,
  /** Label for the session's working directory, e.g. its folder name. */
  project: Schema.String,
  status: SessionStatus,
  title: Schema.String,
});

export type Session = typeof Session.Type;

/** The whole session list. Each event replaces the previous one. */
export const SessionList = Schema.Struct({
  sessions: Schema.Array(Session),
});

export type SessionList = typeof SessionList.Type;

export const contract = {
  sessions: {
    /** The current session list, then a new list on every change. */
    watch: oc.output(asyncIteratorObject(std(SessionList))),
  },
};

export type Contract = typeof contract;

export type BalconyClient = RouterContractClient<Contract>;
