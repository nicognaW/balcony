import type { PairingRefusal } from "@balcony/client";
import { QrCodeIcon } from "lucide-react";
import { useActionState, useId } from "react";

import type { NotPairedProps } from "@/components/balcony-provider.tsx";
import { Button } from "@/components/ui/button.tsx";
import { pairWithCode } from "@/lib/connection.ts";

const NEW_CODE_HINT =
  "Press Enter in the terminal running balcony for a new one.";

/** What to tell the user when the short code didn't pair. */
const REFUSAL_MESSAGES: Record<PairingRefusal, string> = {
  expired: `That code has expired. ${NEW_CODE_HINT}`,
  locked: `Too many wrong tries. ${NEW_CODE_HINT}`,
  other: "Balcony couldn't pair this phone. Try again.",
  unreachable:
    "Couldn't reach Balcony. Is this phone on the same Wi-Fi as your Mac?",
  wrong: "That isn't the code on your Mac. Check it and try again.",
};

/** Pairs by the short code `balcony` prints under the QR code. */
const CodeForm = ({ onPaired }: Pick<NotPairedProps, "onPaired">) => {
  const inputId = useId();
  const errorId = useId();

  const [error, submit, pending] = useActionState(
    async (_previous: string | null, form: FormData) => {
      const result = await pairWithCode(String(form.get("code") ?? ""));

      if ("refusal" in result) {
        return REFUSAL_MESSAGES[result.refusal];
      }

      onPaired(result.paired);

      return null;
    },
    null
  );

  return (
    <form action={submit} className="flex w-full max-w-xs flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={inputId}>
        Or type the code shown under it
      </label>
      <div className="flex gap-2">
        <input
          aria-describedby={error === null ? undefined : errorId}
          aria-invalid={error !== null}
          autoComplete="one-time-code"
          className="border-input bg-card focus-visible:ring-ring h-10 min-w-0 flex-1 rounded-lg border px-3 text-center font-mono text-base tracking-widest tabular-nums outline-none focus-visible:ring-2"
          enterKeyHint="go"
          id={inputId}
          inputMode="numeric"
          maxLength={7}
          name="code"
          pattern="\d{3} ?\d{3}"
          placeholder="123 456"
          required
        />
        <Button disabled={pending} size="lg" type="submit">
          {pending ? "Pairing…" : "Pair"}
        </Button>
      </div>
      {error === null ? null : (
        <p className="text-destructive text-sm text-balance" id={errorId}>
          {error}
        </p>
      )}
    </form>
  );
};

/** Shown until the phone has a token. */
export const NotPaired = ({ onPaired, refused }: NotPairedProps) => (
  <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
    <div className="flex flex-col items-center gap-3">
      <QrCodeIcon aria-hidden className="text-muted-foreground size-10" />
      <h1 className="text-lg font-semibold">
        {refused ? "Pair this phone again" : "Pair this phone"}
      </h1>
      <p className="text-muted-foreground max-w-xs text-sm text-balance">
        {refused ? "Balcony no longer accepts this phone's pairing. " : ""}
        Run <code className="font-mono">balcony</code> on your Mac and scan the
        QR code it prints.
      </p>
    </div>
    <CodeForm onPaired={onPaired} />
  </main>
);
