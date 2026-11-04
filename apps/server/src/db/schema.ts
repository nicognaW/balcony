// Balcony's own state, kept in ~/.balcony/state.db. Agents' files hold
// everything else and are never written.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** What the user has seen and dealt with, per session. */
export const sessionMarks = sqliteTable("session_marks", {
  lastViewedAt: integer("last_viewed_at", { mode: "timestamp_ms" }),
  sessionId: text("session_id").primaryKey(),
  /** Kept after new activity un-settles the session; it is compared with that activity. */
  settledAt: integer("settled_at", { mode: "timestamp_ms" }),
  unsettledAt: integer("unsettled_at", { mode: "timestamp_ms" }),
});
