// Where sessions come from. Each agent Balcony observes (Claude now; Codex and
// pi later) is one AgentSource. Callers only see the merged session list, so
// adding an agent means adding a source, not changing callers.
import type { Agent, Session } from "@balcony/contracts";
import { Context } from "effect";
import type { Stream } from "effect";

export interface AgentSource {
  readonly agent: Agent;
  /**
   * The agent's sessions now, then the full set again after every change.
   * The stream never fails: a source that can't read its files reports what
   * it can.
   */
  readonly sessions: Stream.Stream<readonly Session[]>;
}

/** The agent sources the server observes. */
export class AgentSources extends Context.Service<
  AgentSources,
  readonly AgentSource[]
>()("balcony/AgentSources") {}
