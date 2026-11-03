// Shares the paired connection with the app through React context.
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { PairedContext, queryClient } from "@/lib/connection.ts";
import type { Paired, PairedConnection } from "@/lib/connection.ts";
import { forgetToken } from "@/lib/pairing.ts";

/** Renders `children` while paired, otherwise `fallback`. */
export const BalconyProvider = ({
  children,
  fallback,
  paired,
}: {
  readonly children: ReactNode;
  readonly fallback: (props: { readonly refused: boolean }) => ReactNode;
  readonly paired: PairedConnection | null;
}) => {
  const [refused, setRefused] = useState(false);

  const value = useMemo(
    (): Paired | null =>
      paired === null
        ? null
        : {
            ...paired,
            unpair: () => {
              forgetToken();
              queryClient.clear();
              setRefused(true);
            },
          },
    [paired]
  );

  if (value === null || refused) {
    return fallback({ refused });
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PairedContext value={value}>{children}</PairedContext>
    </QueryClientProvider>
  );
};
