// What the user has seen and dealt with: when each session was last viewed,
// settled and un-settled. Kept in Balcony's database, shared by all clients,
// and never written back to the agents.
import type { Session, SessionMarks as Marks } from "@balcony/contracts";
import type { Stream } from "effect";
import { Context, Effect, Layer, SubscriptionRef } from "effect";

import { Database } from "./db/database.ts";
import { sessionMarks } from "./db/schema.ts";

/** One session's marks, as epoch ms. */
interface StoredMarks {
  readonly lastViewedAt: number | null;
  readonly settledAt: number | null;
  readonly unsettledAt: number | null;
}

const none: StoredMarks = {
  lastViewedAt: null,
  settledAt: null,
  unsettledAt: null,
};

type MarksById = ReadonlyMap<string, StoredMarks>;

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

/**
 * A session's marks as clients see them. Activity after the user settled the
 * session un-settles it, so it is Settled only while its last message is no
 * newer than the settle.
 */
export const marksOf = (
  marks: MarksById,
  session: Pick<Session, "id" | "lastMessageAt">
): Marks => {
  const stored = marks.get(session.id) ?? none;

  const settled =
    stored.settledAt !== null &&
    Date.parse(session.lastMessageAt) <= stored.settledAt;

  return {
    lastViewedAt: iso(stored.lastViewedAt),
    settledAt: settled ? iso(stored.settledAt) : null,
    unsettledAt: iso(stored.unsettledAt),
  };
};

export class SessionMarks extends Context.Service<
  SessionMarks,
  {
    /** Every session's marks now, then again after every change. */
    readonly changes: Stream.Stream<MarksById>;
    readonly markViewed: (id: string) => Effect.Effect<void>;
    readonly settle: (id: string) => Effect.Effect<void>;
    readonly unsettle: (id: string) => Effect.Effect<void>;
  }
>()("balcony/SessionMarks") {
  /** `now` is the server's clock, in epoch ms. */
  static readonly layer = (now: () => number) =>
    Layer.effect(
      SessionMarks,
      Effect.gen(function* makeSessionMarks() {
        const db = yield* Database;
        const rows = yield* db.select().from(sessionMarks).pipe(Effect.orDie);

        const latest = yield* SubscriptionRef.make<MarksById>(
          new Map(
            rows.map((row) => [
              row.sessionId,
              {
                lastViewedAt: row.lastViewedAt?.getTime() ?? null,
                settledAt: row.settledAt?.getTime() ?? null,
                unsettledAt: row.unsettledAt?.getTime() ?? null,
              },
            ])
          )
        );

        /** Saves some of a session's marks, then tells every watcher. */
        const save = (id: string, patch: Partial<StoredMarks>) =>
          Effect.gen(function* saveMarks() {
            const dates = Object.fromEntries(
              Object.entries(patch).map(([key, ms]) => [
                key,
                ms === null ? null : new Date(ms),
              ])
            );

            yield* db
              .insert(sessionMarks)
              .values({ sessionId: id, ...dates })
              .onConflictDoUpdate({
                set: dates,
                target: sessionMarks.sessionId,
              })
              .pipe(Effect.orDie);

            yield* SubscriptionRef.update(latest, (marks) =>
              new Map(marks).set(id, { ...(marks.get(id) ?? none), ...patch })
            );
          });

        return {
          changes: SubscriptionRef.changes(latest),
          markViewed: (id) => save(id, { lastViewedAt: now() }),
          settle: (id) => save(id, { settledAt: now() }),
          unsettle: (id) => save(id, { settledAt: null, unsettledAt: now() }),
        };
      })
    );
}
