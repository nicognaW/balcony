// The merged session list of every agent source, read once and shared by all
// connected clients.
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
      const latest = yield* SubscriptionRef.make(Option.none<SessionList>());
      yield* Stream.zipLatestAll(
        ...sources.map((source) => source.sessions)
      ).pipe(
        Stream.runForEach((lists) =>
          SubscriptionRef.set(latest, Option.some({ sessions: lists.flat() }))
        ),
        Effect.forkScoped
      );

      return {
        changes: SubscriptionRef.changes(latest).pipe(
          Stream.filter(Option.isSome),
          Stream.map((list) => list.value),
          Stream.changes
        ),
      };
    })
  );
}
