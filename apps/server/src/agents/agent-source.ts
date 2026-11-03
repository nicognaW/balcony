// Where sessions come from. Each agent Balcony observes (Claude now; Codex and
// pi later) is one AgentSource. Callers only see the merged session list, so
// adding an agent means adding a source, not changing callers.
import type { Agent, Session, TranscriptEntry } from "@balcony/contracts";
import { Context } from "effect";
import type { Effect, Option, Stream } from "effect";

export interface AgentSource {
  readonly agent: Agent;
  /**
   * The agent's sessions now, then the full set again after every change.
   * The stream never fails: a source that can't read its files reports what
   * it can.
   */
  readonly sessions: Stream.Stream<readonly Session[]>;
  /**
   * A session's whole Transcript, oldest entry first, then the whole
   * Transcript again after every change. Entries only get appended, unless
   * the agent rewrote the Transcript. None when this source doesn't have the
   * session.
   */
  readonly transcript: (
    sessionId: string
  ) => Effect.Effect<Option.Option<Stream.Stream<readonly TranscriptEntry[]>>>;
}

/** The agent sources the server observes. */
export class AgentSources extends Context.Service<
  AgentSources,
  readonly AgentSource[]
>()("balcony/AgentSources") {}
