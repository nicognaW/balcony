import { settledPage } from "@balcony/client";
import type { SessionRow as Row } from "@balcony/client";
import {
  usePaired,
  useSessionList,
  useSettleWithUndo,
  useUnpairWhenRefused,
} from "@balcony/client/react";
import type { Session } from "@balcony/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";

import { SessionRow } from "@/components/session-row.tsx";
import { UndoToast } from "@/components/undo-toast.tsx";

/** Settles a row, or un-settles it when it is Settled. */
type Settle = (row: Row) => Promise<void>;

const Rows = ({
  onSettle,
  rows,
}: {
  readonly onSettle: Settle;
  readonly rows: readonly Row[];
}) => (
  <ul className="flex flex-col gap-2">
    {rows.map((row) => (
      <SessionRow key={row.id} onSettle={() => onSettle(row)} row={row} />
    ))}
  </ul>
);

/** A titled section of the list, like T3 Code's sidebar shelves. */
const Section = ({
  label,
  onSettle,
  rows,
}: {
  readonly label: string;
  readonly onSettle: Settle;
  readonly rows: readonly Row[];
}) => {
  const id = useId();

  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2
        className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs font-medium"
        id={id}
      >
        {label}
        <span className="text-muted-foreground/70 tabular-nums">
          {rows.length}
        </span>
      </h2>
      <Rows onSettle={onSettle} rows={rows} />
    </section>
  );
};

/**
 * Settled sessions at the bottom: collapsed until opened, then 10 at a time
 * with Show more, as T3 Code's settled shelf.
 */
const SettledSection = ({
  onSettle,
  rows,
}: {
  readonly onSettle: Settle;
  readonly rows: readonly Row[];
}) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(0);
  const page = settledPage(rows, more);

  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id}>
        <button
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-1.5 rounded px-1 text-xs font-medium outline-none focus-visible:ring-2"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <ChevronRightIcon
            aria-hidden
            className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          Settled
          <span className="text-muted-foreground/70 tabular-nums">
            {rows.length}
          </span>
        </button>
      </h2>
      {open ? (
        <>
          <Rows onSettle={onSettle} rows={page.rows} />
          {page.hidden > 0 ? (
            <button
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded px-1 py-1.5 text-left text-xs font-medium outline-none focus-visible:ring-2"
              onClick={() => setMore(more + 1)}
              type="button"
            >
              Show more ({page.hidden} settled hidden)
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

const Sections = ({
  receivedAt,
  sessions,
}: {
  readonly receivedAt: number;
  readonly sessions: readonly Session[];
}) => {
  const { main, settled, working } = useSessionList(sessions, receivedAt);
  const undoable = useSettleWithUndo(usePaired().connection.client);

  const onSettle: Settle = (row) =>
    undoable.settle(row.id, row.session.settledAt === null);

  return (
    <div className="flex flex-col gap-5 px-3 pb-20">
      {working.length > 0 ? (
        <Section label="Working" onSettle={onSettle} rows={working} />
      ) : null}
      {main.length > 0 ? <Rows onSettle={onSettle} rows={main} /> : null}
      {settled.length > 0 ? (
        <SettledSection onSettle={onSettle} rows={settled} />
      ) : null}
      <UndoToast notice={undoable.notice} onUndo={() => undoable.undo()} />
    </div>
  );
};

const SessionList = () => {
  const { orpc } = usePaired();

  const { data, dataUpdatedAt, error } = useQuery(
    orpc.sessions.watch.liveOptions()
  );

  useUnpairWhenRefused(error);

  if (data === undefined) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        Loading sessions…
      </p>
    );
  }

  if (data.sessions.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        No Claude sessions in the last 24 hours.
      </p>
    );
  }

  return <Sections receivedAt={dataUpdatedAt} sessions={data.sessions} />;
};

export const Route = createFileRoute("/")({ component: SessionList });
