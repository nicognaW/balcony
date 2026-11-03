import type { SessionRow as Row } from "@balcony/client";
import type { Session } from "@balcony/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId } from "react";

import { SessionRow } from "@/components/session-row.tsx";
import { usePaired } from "@/hooks/use-paired.ts";
import { useSessionList } from "@/hooks/use-session-list.ts";
import { isUnauthorized } from "@/lib/connection.ts";

const Rows = ({ rows }: { readonly rows: readonly Row[] }) => (
  <ul className="flex flex-col gap-2">
    {rows.map((row) => (
      <SessionRow key={row.id} row={row} />
    ))}
  </ul>
);

/** A titled section of the list, like T3 Code's sidebar shelves. */
const Section = ({
  label,
  rows,
}: {
  readonly label: string;
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
      <Rows rows={rows} />
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
  const { main, working } = useSessionList(sessions, receivedAt);

  return (
    <div className="flex flex-col gap-5 px-3 pb-6">
      {working.length > 0 ? <Section label="Working" rows={working} /> : null}
      {main.length > 0 ? <Rows rows={main} /> : null}
    </div>
  );
};

const SessionList = () => {
  const { orpc, unpair } = usePaired();

  const { data, dataUpdatedAt, error } = useQuery(
    orpc.sessions.watch.liveOptions()
  );

  useEffect(() => {
    if (isUnauthorized(error)) {
      unpair();
    }
  }, [error, unpair]);

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
