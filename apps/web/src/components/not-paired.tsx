import { QrCodeIcon } from "lucide-react";

/** Shown until the phone has a token. */
export const NotPaired = ({ refused }: { readonly refused: boolean }) => (
  <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
    <QrCodeIcon aria-hidden className="text-muted-foreground size-10" />
    <h1 className="text-lg font-semibold">
      {refused ? "Pair this phone again" : "Pair this phone"}
    </h1>
    <p className="text-muted-foreground max-w-xs text-sm text-balance">
      {refused ? "Balcony no longer accepts this phone's pairing. " : ""}
      Run <code className="font-mono">balcony</code> on your Mac and scan the QR
      code it prints.
    </p>
  </main>
);
