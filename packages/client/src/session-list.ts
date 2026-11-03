// The session list rules shared by the web and mobile apps: sections and
// order, following T3 Code's inbox.
//
// The comparators are adapted from T3 Code (MIT, (c) 2026 T3 Tools Inc.,
// packages/client-runtime/src/state/threadInbox.ts); see
// third-party-licenses/t3code.txt.
import type { Session } from "@balcony/contracts";

/**
 * The top-right corner of a row: Working with the time its turn began (null
 * when unknown), Done when it finished a turn the user hasn't seen, otherwise
 * the time to show relative to now. Times are epoch ms, so the row can tick
 * without a new view.
 */
export type RowMark =
  | { readonly kind: "working"; readonly since: number | null }
  | { readonly kind: "done" }
  | { readonly kind: "time"; readonly at: number };

export interface SessionRow {
  readonly id: string;
  readonly project: string;
  readonly title: string;
  readonly branch: string | null;
  readonly mark: RowMark;
  readonly session: Session;
}

export interface SessionListView {
  /** Sessions in the middle of a turn, on top. */
  readonly working: readonly SessionRow[];
  /** Every other listed session, in inbox order. */
  readonly main: readonly SessionRow[];
  /**
   * Sessions the user settled, most recently settled first, for the
   * collapsed section at the bottom. Page them with `settledPage`.
   */
  readonly settled: readonly SessionRow[];
}

export interface SessionListUpdate {
  readonly view: SessionListView;
  /**
   * When the view changes with no new session data (a Working grace ends),
   * in epoch ms: update again then. Null when nothing is pending.
   */
  readonly nextChangeAt: number | null;
}

/**
 * How long a session that stopped stays in Working. A turn can end moments
 * before the next one starts (a tool hands back, a queued message runs), so
 * the row waits this long before moving.
 */
export const WORKING_EXIT_GRACE_MS = 2000;

/** Epoch ms of an ISO time, or null for none (or one that doesn't parse). */
const parseTime = (time: string | null): number | null => {
  const ms = time === null ? Number.NaN : Date.parse(time);

  return Number.isFinite(ms) ? ms : null;
};

/** Epoch ms of an ISO time, or 0 for none, for sorting. */
const toMs = (time: string | null): number => parseTime(time) ?? 0;

/** Newest first by `key`, then by id so equal keys keep a stable order. */
const newestFirst = (
  sessions: readonly Session[],
  key: (session: Session) => number
): Session[] => {
  const keys = new Map(sessions.map((session) => [session, key(session)]));

  return sessions.toSorted(
    (left, right) =>
      (keys.get(right) ?? 0) - (keys.get(left) ?? 0) ||
      left.id.localeCompare(right.id)
  );
};

/**
 * T3 Code's inbox order: the newest of the user's last message, the agent's
 * last turn start or finish, and when the user un-settled the session.
 */
const inboxTime = (session: Session, returnedAt = 0): number =>
  Math.max(
    returnedAt,
    toMs(session.unsettledAt),
    toMs(session.lastUserMessageAt),
    toMs(session.turnStartedAt),
    toMs(session.turnEndedAt)
  );

/** Settled by the user, with no activity since (the server checks that). */
const isSettled = (session: Session): boolean => session.settledAt !== null;

/** T3 Code's Working order: newest send first. */
const sendTime = (session: Session): number =>
  toMs(session.lastUserMessageAt ?? session.turnStartedAt);

/**
 * Whether the session finished a turn after the user last viewed it. A
 * session never opened isn't Done, as in T3 Code: everything would be.
 */
const isDone = (session: Session): boolean => {
  const viewedAt = parseTime(session.lastViewedAt);
  const endedAt = parseTime(session.turnEndedAt);

  return viewedAt !== null && endedAt !== null && endedAt > viewedAt;
};

const markOf = (session: Session, working: boolean): RowMark => {
  if (working) {
    return {
      kind: "working",
      since: parseTime(session.turnStartedAt ?? session.lastUserMessageAt),
    };
  }

  if (isDone(session)) {
    return { kind: "done" };
  }

  // The user's last message time, as T3 Code shows.
  return {
    at: toMs(session.lastUserMessageAt ?? session.lastMessageAt),
    kind: "time",
  };
};

const rowOf =
  (working: boolean) =>
  (session: Session): SessionRow => ({
    branch: session.branch,
    id: session.id,
    mark: markOf(session, working),
    project: session.project,
    session,
    title: session.title,
  });

interface Tracked {
  /** Whether the row shows in Working, counting the grace. */
  readonly working: boolean;
  /** When the grace ends, while the row is in it. */
  readonly graceEndsAt: number | null;
}

/**
 * The session list as the user sees it over time. Keep one per list (not per
 * render) so the Working grace survives re-renders, and call `update` with
 * every new session list and again at `nextChangeAt`.
 */
export const createSessionList = () => {
  const tracked = new Map<string, Tracked>();
  /** When each session last left Working, which counts in inbox order. */
  const returnedAt = new Map<string, number>();

  const track = (session: Session, now: number): Tracked => {
    const previous = tracked.get(session.id);

    // Settling takes a session out of Working at once (T3 Code's `excluded`).
    if (session.settledAt !== null) {
      return { graceEndsAt: null, working: false };
    }

    if (session.status === "working") {
      return { graceEndsAt: null, working: true };
    }

    if (previous?.working !== true) {
      return { graceEndsAt: null, working: false };
    }

    const graceEndsAt = previous.graceEndsAt ?? now + WORKING_EXIT_GRACE_MS;

    if (graceEndsAt > now) {
      return { graceEndsAt, working: true };
    }

    returnedAt.set(session.id, now);

    return { graceEndsAt: null, working: false };
  };

  const update = (
    sessions: readonly Session[],
    now: number
  ): SessionListUpdate => {
    const present = new Set(sessions.map((session) => session.id));

    for (const id of tracked.keys()) {
      if (!present.has(id)) {
        tracked.delete(id);
        returnedAt.delete(id);
      }
    }

    for (const session of sessions) {
      tracked.set(session.id, track(session, now));
    }

    const isWorking = (session: Session) =>
      tracked.get(session.id)?.working === true;

    const open = sessions.filter((session) => !isSettled(session));

    const graceEnds = [...tracked.values()].flatMap(({ graceEndsAt }) =>
      graceEndsAt === null ? [] : [graceEndsAt]
    );

    return {
      nextChangeAt: graceEnds.length > 0 ? Math.min(...graceEnds) : null,
      view: {
        main: newestFirst(
          open.filter((session) => !isWorking(session)),
          (session) => inboxTime(session, returnedAt.get(session.id))
        ).map(rowOf(false)),
        settled: newestFirst(sessions.filter(isSettled), (session) =>
          toMs(session.settledAt)
        ).map(rowOf(false)),
        working: newestFirst(open.filter(isWorking), sendTime).map(rowOf(true)),
      },
    };
  };

  return { update };
};

/** A session list made by `createSessionList`. */
export type SessionListModel = ReturnType<typeof createSessionList>;

/** Settled sessions shown before the user asks for more (T3 Code's count). */
export const SETTLED_FIRST_PAGE = 10;

/** Settled sessions added each time the user asks for more. */
export const SETTLED_PAGE = 25;

export interface SettledPage {
  readonly rows: readonly SessionRow[];
  /** Settled rows not shown yet. */
  readonly hidden: number;
}

/**
 * The settled rows to show after the user asked for more `more` times, and
 * how many stay hidden (for "Show more").
 */
export const settledPage = (
  settled: readonly SessionRow[],
  more: number
): SettledPage => {
  const count = SETTLED_FIRST_PAGE + more * SETTLED_PAGE;

  return {
    hidden: Math.max(0, settled.length - count),
    rows: settled.slice(0, count),
  };
};
