// A session in the list, laid out like T3 Code's sidebar row: project and
// status or time, then the title, then the branch. Swiped left with a
// finger, it settles (or un-settles); keyboards and screen readers have a
// Settle button that shows when focused. Adapted from T3 Code (MIT, (c) 2026
// T3 Tools Inc., apps/web/src/components/sidebar/SidebarThreadRow.tsx).
import { formatRelativeTime, formatWorkingDuration } from "@balcony/client";
import type { RowMark, SessionRow as Row } from "@balcony/client";
import { useNow } from "@balcony/client/react";
import { Link } from "@tanstack/react-router";
import { CircleCheckIcon, CircleDashedIcon, GitBranchIcon } from "lucide-react";

import { SwipeToSettle } from "@/components/swipe-to-settle.tsx";

const WorkingDuration = ({ since }: { readonly since: number }) => {
  const now = useNow(1000);

  return <span aria-hidden>{formatWorkingDuration(now - since)}</span>;
};

const RelativeTime = ({ at }: { readonly at: number }) => {
  const now = useNow(30_000);

  return (
    <time dateTime={new Date(at).toISOString()}>
      {formatRelativeTime(now - at)}
    </time>
  );
};

/** Working with its elapsed time, Done, or how long ago the session was active. */
const Mark = ({ mark }: { readonly mark: RowMark }) => {
  switch (mark.kind) {
    case "time": {
      return <RelativeTime at={mark.at} />;
    }

    case "done": {
      return (
        <span className="text-success-foreground inline-flex items-center gap-1 font-medium">
          <CircleCheckIcon aria-hidden className="size-4 shrink-0" />
          Done
        </span>
      );
    }

    default: {
      return (
        <span className="text-info-foreground inline-flex items-center gap-1 font-medium">
          <CircleDashedIcon
            aria-hidden
            className="motion-safe:animate-spin-slow size-4 shrink-0"
          />
          Working
          {mark.since === null ? null : <WorkingDuration since={mark.since} />}
        </span>
      );
    }
  }
};

/**
 * Settles the session, or un-settles it when it is Settled: out of sight
 * until focused, for keyboards and screen readers, which can't swipe.
 */
const SettleButton = ({
  onSettle,
  row,
}: {
  readonly onSettle: () => Promise<void>;
  readonly row: Row;
}) => {
  const settled = row.session.settledAt !== null;

  return (
    <button
      aria-label={`${settled ? "Un-settle" : "Settle"} ${row.title}`}
      className="bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring pointer-events-none absolute right-1.5 bottom-1 rounded px-1.5 py-1 text-xs font-medium opacity-0 outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2"
      onClick={() => {
        void onSettle().catch(() => {
          // The list stays as it was; the user can try again.
        });
      }}
      type="button"
    >
      {settled ? "Un-settle" : "Settle"}
    </button>
  );
};

export const SessionRow = ({
  onSettle,
  row,
}: {
  /** Settles the row, or un-settles it when it is Settled. */
  readonly onSettle: () => Promise<void>;
  readonly row: Row;
}) => {
  const settled = row.session.settledAt !== null;

  return (
    <li className="relative">
      {/* Keyed by its side: a row just settled or un-settled starts at home. */}
      <SwipeToSettle
        key={String(settled)}
        onSettle={onSettle}
        settled={settled}
      >
        <Link
          className="bg-card hover:bg-accent block h-[4.875rem] rounded-xl border px-3 py-2"
          draggable={false}
          params={{ sessionId: row.id }}
          to="/s/$sessionId"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
              {row.project}
            </span>
            <span className="text-muted-foreground ml-auto flex h-5 shrink-0 items-center text-xs tabular-nums">
              <Mark mark={row.mark} />
            </span>
          </div>
          <p className="mt-1 truncate text-sm">{row.title}</p>
          {row.branch === null ? null : (
            <p className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-xs">
              <GitBranchIcon aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{row.branch}</span>
            </p>
          )}
        </Link>
      </SwipeToSettle>
      <SettleButton onSettle={onSettle} row={row} />
    </li>
  );
};
