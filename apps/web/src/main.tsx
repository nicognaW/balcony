import "./index.css";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BalconyProvider } from "@/components/balcony-provider.tsx";
import { NotPaired } from "@/components/not-paired.tsx";
import { connectPaired } from "@/lib/connection.ts";

import { routeTree } from "./routeTree.gen.ts";

const router = createRouter({ defaultPreload: "intent", routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.querySelector("#root");

if (root === null) {
  throw new Error("index.html has no #root");
}

createRoot(root).render(
  <StrictMode>
    <BalconyProvider fallback={NotPaired} initial={connectPaired()}>
      <RouterProvider router={router} />
    </BalconyProvider>
  </StrictMode>
);
