// Shares the paired connection with the app through React context.
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";

import { PairedContext, queryClient } from "@/lib/connection.ts";
import type { Paired, PairedConnection } from "@/lib/connection.ts";
import { forgetToken } from "@/lib/pairing.ts";

export interface NotPairedProps {
  /** The server refused the pairing this phone had. */
  readonly refused: boolean;
  /** Switches to a connection made by pairing on this screen. */
  readonly onPaired: (paired: PairedConnection) => void;
}

/** Renders `children` while paired, otherwise `fallback`. */
export const BalconyProvider = ({
  children,
  fallback: Fallback,
  initial,
}: {
  readonly children: ReactNode;
  readonly fallback: ComponentType<NotPairedProps>;
  /** The connection made at load, null when this phone isn't paired. */
  readonly initial: PairedConnection | null;
}) => {
  const [paired, setPaired] = useState(initial);
  const [refused, setRefused] = useState(false);

  const value = useMemo(
    (): Paired | null =>
      paired === null
        ? null
        : {
            ...paired,
            unpair: () => {
              paired.connection.close();
              forgetToken();
              queryClient.clear();
              setPaired(null);
              setRefused(true);
            },
          },
    [paired]
  );

  if (value === null) {
    return (
      <Fallback
        onPaired={(next) => {
          setRefused(false);
          setPaired(next);
        }}
        refused={refused}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PairedContext value={value}>{children}</PairedContext>
    </QueryClientProvider>
  );
};
