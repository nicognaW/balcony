// What the user has seen and dealt with: when each session was last viewed,
// settled and un-settled. Kept in Balcony's database, shared by all clients,
// and never written back to the agents.
import type { Session, SessionMarks as Marks } from "@balcony/contracts";
import type { Scope, Stream } from "effect";
import { Context, Effect, Layer, SubscriptionRef } from "effect";

import { Database } from "./db/database.ts";
import { sessionMarks } from "./db/schema.ts";

/** One session's marks, as epoch ms. */
interface StoredMarks {
  readonly lastViewedAt: number | null;
  readonly settledAt: number | null;
  readonly unsettledAt: number | null;
}

/** A session's marks, and how many clients have it open now. */
interface HeldMarks extends StoredMarks {
  readonly viewers: number;
}

const none: HeldMarks = {
  lastViewedAt: null,
  settledAt: null,
  unsettledAt: null,
  viewers: 0,
};

type MarksById = ReadonlyMap<string, HeldMarks>;

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

/**
 * A session's marks as clients see them. Activity after the user settled the
 * session un-settles it, so it is Settled only while its last message is no
 * newer than the settle. While a client has the session open, every turn
 * that ends counts as viewed at once.
 */
export const marksOf = (
  marks: MarksById,
  session: Pick<Session, "id" | "lastMessageAt" | "turnEndedAt">
): Marks => {
  const stored = marks.get(session.id) ?? none;

  const lastViewedAt =
    stored.viewers > 0 && session.turnEndedAt !== null
      ? Math.max(stored.lastViewedAt ?? 0, Date.parse(session.turnEndedAt))
      : stored.lastViewedAt;

  const settled =
    stored.settledAt !== null &&
    Date.parse(session.lastMessageAt) <= stored.settledAt;

  return {
    lastViewedAt: iso(lastViewedAt),
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
    /**
     * Holds the session open until the scope closes, marking it viewed at
     * both ends.
     */
    readonly view: (id: string) => Effect.Effect<void, never, Scope.Scope>;
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
                viewers: 0,
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

        const markViewed = (id: string) => save(id, { lastViewedAt: now() });

        /** Counts one more (`1`) or one fewer (`-1`) client viewing. */
        const countViewer = (id: string, by: 1 | -1) =>
          SubscriptionRef.update(latest, (marks) => {
            const held = marks.get(id) ?? none;

            return new Map(marks).set(id, {
              ...held,
              viewers: held.viewers + by,
            });
          });

        return {
          changes: SubscriptionRef.changes(latest),
          markViewed,
          settle: (id) => save(id, { settledAt: now() }),
          unsettle: (id) => save(id, { settledAt: null, unsettledAt: now() }),
          // Marked before the count drops, so no list in between shows a
          // turn that ended meanwhile as Done.
          view: (id) =>
            Effect.acquireRelease(
              Effect.andThen(markViewed(id), countViewer(id, 1)),
              () => Effect.andThen(markViewed(id), countViewer(id, -1))
            ),
        };
      })
    );
}
