import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { SessionRow } from "@/components/session-row.tsx";
import { usePaired } from "@/hooks/use-paired.ts";
import { isUnauthorized } from "@/lib/connection.ts";

const SessionList = () => {
  const { orpc, unpair } = usePaired();
  const { data, error } = useQuery(orpc.sessions.watch.liveOptions());

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
        No Claude sessions yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-3 pb-6">
      {data.sessions.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </ul>
  );
};

export const Route = createFileRoute("/")({ component: SessionList });
