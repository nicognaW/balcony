// "Settled · Undo" over the bottom of the list, after a swipe or the row's
// Settle button. It rises 8px as it fades in over 200ms (opacity only with
// reduced motion), and goes at once: it is announced as a status.
import type { SettleNotice } from "@balcony/client/react";

export const UndoToast = ({
  notice,
  onUndo,
}: {
  readonly notice: SettleNotice | null;
  readonly onUndo: () => void;
}) => (
  // Always rendered, so screen readers hear each notice as it appears.
  <output className="pb-safe-3 pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl px-3">
    {notice === null ? null : (
      <div className="bg-foreground text-background ease-out-strong pointer-events-auto flex items-center rounded-xl py-1 pr-1 pl-4 text-sm shadow-lg transition duration-200 starting:opacity-0 motion-safe:starting:translate-y-2">
        <span className="flex-1">{notice.label}</span>
        <button
          className="focus-visible:ring-ring rounded-lg px-4 py-2 font-semibold outline-none hover:opacity-80 focus-visible:ring-2"
          onClick={onUndo}
          type="button"
        >
          Undo
        </button>
      </div>
    )}
  </output>
);
