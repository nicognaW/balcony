// A session in the list, laid out like T3 Code's sidebar row: project and
// status or time, then the title, then the branch. Adapted from T3 Code (MIT,
// (c) 2026 T3 Tools Inc., apps/web/src/components/sidebar/SidebarThreadRow.tsx).
import { formatRelativeTime, formatWorkingDuration } from "@balcony/client";
import type { RowMark, SessionRow as Row } from "@balcony/client";
import { CircleCheckIcon, CircleDashedIcon, GitBranchIcon } from "lucide-react";

import { useNow } from "@/hooks/use-now.ts";
import { useSettle } from "@/hooks/use-session-marks.ts";

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

/** Settles the session, or un-settles it when it is Settled. */
const SettleButton = ({ row }: { readonly row: Row }) => {
  const settle = useSettle();
  const settled = row.session.settledAt !== null;

  return (
    <button
      aria-label={`${settled ? "Un-settle" : "Settle"} ${row.title}`}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -my-1 ml-auto shrink-0 rounded px-1.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 disabled:opacity-64"
      disabled={settle.isPending}
      onClick={() => settle.mutate({ id: row.id, settled: !settled })}
      type="button"
    >
      {settled ? "Un-settle" : "Settle"}
    </button>
  );
};

export const SessionRow = ({ row }: { readonly row: Row }) => (
  <li className="bg-card h-[4.875rem] rounded-xl border px-3 py-2">
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
        {row.project}
      </span>
      <span className="text-muted-foreground ml-auto flex h-5 shrink-0 items-center text-xs tabular-nums">
        <Mark mark={row.mark} />
      </span>
    </div>
    <p className="mt-1 truncate text-sm">{row.title}</p>
    <div className="text-muted-foreground mt-0.5 flex h-4 min-w-0 items-center gap-1 text-xs">
      {row.branch === null ? null : (
        <>
          <GitBranchIcon aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{row.branch}</span>
        </>
      )}
      <SettleButton row={row} />
    </div>
  </li>
);
