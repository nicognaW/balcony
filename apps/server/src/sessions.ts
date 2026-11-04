// The merged session list of every agent source with the user's marks, read
// once and shared by all connected clients.
import type { SessionList } from "@balcony/contracts";
import {
  Context,
  Effect,
  Layer,
  Option,
  Stream,
  SubscriptionRef,
} from "effect";

import { AgentSources } from "./agents/agent-source.ts";
import type { SourceSession } from "./agents/agent-source.ts";
import { marksOf, SessionMarks } from "./session-marks.ts";

export class Sessions extends Context.Service<
  Sessions,
  {
    /** The current list, then the new list after every change. */
    readonly changes: Stream.Stream<SessionList>;
  }
>()("balcony/Sessions") {
  static readonly layer = Layer.effect(
    Sessions,
    Effect.gen(function* makeSessions() {
      const sources = yield* AgentSources;
      const marks = yield* SessionMarks;

      const latest = yield* SubscriptionRef.make(
        Option.none<readonly SourceSession[]>()
      );

      yield* Stream.zipLatestAll(
        ...sources.map((source) => source.sessions)
      ).pipe(
        Stream.runForEach((lists) =>
          SubscriptionRef.set(latest, Option.some(lists.flat()))
        ),
        Effect.forkScoped
      );

      const agentSessions = SubscriptionRef.changes(latest).pipe(
        Stream.filter(Option.isSome),
        Stream.map((list) => list.value)
      );

      return {
        changes: Stream.zipLatest(agentSessions, marks.changes).pipe(
          Stream.map(([sessions, byId]): SessionList => ({
            sessions: sessions.map((session) => ({
              ...session,
              ...marksOf(byId, session),
            })),
          })),
          Stream.changes
        ),
      };
    })
  );
}
