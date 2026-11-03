import { sessionTitle } from "@balcony/client";
import { usePaired } from "@balcony/client/react";
import { useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  Link,
  Outlet,
  useMatch,
} from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { ConnectionIndicator } from "@/components/connection-indicator.tsx";

/** Back to the list, and the open session's project and title. */
const SessionHeading = ({ sessionId }: { readonly sessionId: string }) => {
  const { orpc } = usePaired();
  // The list's own live query: shared, so this opens no second watch.
  const { data } = useQuery(orpc.sessions.watch.liveOptions());
  const session = data?.sessions.find((found) => found.id === sessionId);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        aria-label="Back to sessions"
        className="hover:bg-accent -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full"
        to="/"
      >
        <ArrowLeftIcon aria-hidden className="size-5" />
      </Link>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {session === undefined ? "Session" : sessionTitle(session)}
        </p>
        {session === undefined ? null : (
          <p className="text-muted-foreground truncate text-xs">
            {session.project}
          </p>
        )}
      </div>
    </div>
  );
};

const RootLayout = () => {
  const transcript = useMatch({ from: "/s/$sessionId", shouldThrow: false });

  return (
    <div className="safe-area-inset mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="bg-background/90 sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 backdrop-blur">
        {transcript === undefined ? (
          <span className="font-semibold">Balcony</span>
        ) : (
          <SessionHeading sessionId={transcript.params.sessionId} />
        )}
        <ConnectionIndicator />
      </header>
      <Outlet />
    </div>
  );
};

export const Route = createRootRoute({ component: RootLayout });
