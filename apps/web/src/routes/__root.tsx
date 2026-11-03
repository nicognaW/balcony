import { createRootRoute, Outlet } from "@tanstack/react-router";

import { ConnectionIndicator } from "@/components/connection-indicator.tsx";

const RootLayout = () => (
  <div className="safe-area-inset mx-auto flex min-h-dvh max-w-2xl flex-col">
    <header className="bg-background/90 sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 backdrop-blur">
      <span className="font-semibold">Balcony</span>
      <ConnectionIndicator />
    </header>
    <Outlet />
  </div>
);

export const Route = createRootRoute({ component: RootLayout });
