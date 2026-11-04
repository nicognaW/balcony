// Swipe a session row left, with a finger, to settle it or to un-settle a
// Settled one. The direction lock and threshold come from @balcony/client,
// shared with the Android app. The row follows the finger by writing its
// transform directly, so React doesn't render on every move; releases are
// CSS transitions, which retarget if the row is caught again. A mouse or
// pen drags nothing: they have the row's Settle button instead.
import { swipeArmed, swipeAxis, swipeOffset } from "@balcony/client";
import { CheckCheckIcon, InboxIcon } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

/** How long a settled row waits off-screen for the list to move it. */
const MOVE_WAIT_MS = 1500;

/** Back home short of the threshold. */
const HOME = "transform 300ms var(--ease-out-strong)";

/** Off to the left past it. */
const AWAY = "transform 200ms var(--ease-out-strong)";

interface Drag {
  readonly pointerId: number;
  readonly downX: number;
  readonly downY: number;
  /** Where the row was when the finger went down. */
  readonly from: number;
  readonly width: number;
  axis: "undecided" | "swipe" | "pass";
  offset: number;
}

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The row's place now, mid-transition included. */
const currentOffset = (row: HTMLElement): number =>
  new DOMMatrixReadOnly(getComputedStyle(row).transform).m41;

const Action = ({
  armed,
  settled,
}: {
  readonly armed: boolean;
  readonly settled: boolean;
}) => {
  const Glyph = settled ? InboxIcon : CheckCheckIcon;

  return (
    <div
      className={`absolute inset-0 flex items-center justify-end gap-1.5 rounded-xl pr-5 text-sm font-medium ${armed ? "bg-primary text-primary-foreground ease-out-strong opacity-0 transition-opacity duration-150 group-data-armed:opacity-100" : "bg-secondary text-muted-foreground"}`}
    >
      <Glyph aria-hidden className="size-[18px] shrink-0" />
      {settled ? "Un-settle" : "Settle"}
    </div>
  );
};

export const SwipeToSettle = ({
  children,
  onSettle,
  settled,
}: {
  readonly children: ReactNode;
  /** Settles or un-settles; rejects when the server refused. */
  readonly onSettle: () => Promise<void>;
  /** Whether the row is Settled now: the swipe un-settles it. */
  readonly settled: boolean;
}) => {
  const frame = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const behind = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The last touch swiped, so the click it ends with doesn't open the row.
  const swiped = useRef(false);
  const committing = useRef(false);
  // Sliding off: settles once the slide ends.
  const sliding = useRef(false);
  const waiting = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(waiting.current), []);

  /** Draws the row at `offset`, with `transition` (none follows the finger). */
  const place = (offset: number, transition: string) => {
    const width = frame.current?.offsetWidth ?? 0;

    if (row.current !== null) {
      row.current.style.transition = reducedMotion() ? "none" : transition;
      row.current.style.transform =
        offset === 0 ? "" : `translateX(${String(offset)}px)`;
    }

    if (behind.current !== null) {
      // Hidden at home, so its colour never rims the card's corners.
      behind.current.style.opacity = String(Math.min(1, -offset / 16));
    }

    frame.current?.toggleAttribute("data-armed", swipeArmed(offset, width));
  };

  const comeBack = () => {
    committing.current = false;
    place(0, HOME);
  };

  const commit = async () => {
    try {
      await onSettle();
      // The list moves the row once the server's change arrives (the row
      // remounts, at home, keyed by its side); if that never comes, the
      // row comes back rather than leave a gap.
      waiting.current = setTimeout(comeBack, MOVE_WAIT_MS);
    } catch {
      comeBack();
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swiped.current = false;

    if (
      event.pointerType !== "touch" ||
      committing.current ||
      row.current === null ||
      frame.current === null
    ) {
      return;
    }

    drag.current = {
      axis: "undecided",
      downX: event.clientX,
      downY: event.clientY,
      from: currentOffset(row.current),
      offset: 0,
      pointerId: event.pointerId,
      width: frame.current.offsetWidth,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const touch = drag.current;

    if (touch === null || touch.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - touch.downX;

    if (touch.axis === "undecided") {
      touch.axis = swipeAxis(dx, event.clientY - touch.downY);

      if (touch.axis === "pass") {
        drag.current = null;

        return;
      }

      if (touch.axis === "swipe") {
        swiped.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (touch.axis === "swipe") {
      touch.offset = swipeOffset(touch.from + dx, touch.width);
      place(touch.offset, "none");
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const touch = drag.current;

    if (touch === null || touch.pointerId !== event.pointerId) {
      return;
    }

    drag.current = null;

    if (touch.axis !== "swipe") {
      return;
    }

    if (!swipeArmed(touch.offset, touch.width)) {
      place(0, HOME);

      return;
    }

    committing.current = true;
    place(-touch.width, AWAY);

    if (reducedMotion()) {
      void commit();
    } else {
      sliding.current = true;
    }
  };

  // The browser took the touch (it began scrolling): never settles.
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      place(0, HOME);
    }
  };

  return (
    // The row's link and its Settle button are the controls; this only
    // moves them.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- touch-only swipe; the row's Settle button is its accessible equivalent.
    <div
      className="group relative touch-pan-y overflow-hidden rounded-xl"
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={frame}
    >
      <div aria-hidden className="absolute inset-0 opacity-0" ref={behind}>
        <Action armed={false} settled={settled} />
        <Action armed settled={settled} />
      </div>
      <div
        onTransitionEnd={(event) => {
          if (
            sliding.current &&
            event.target === event.currentTarget &&
            event.propertyName === "transform"
          ) {
            sliding.current = false;
            void commit();
          }
        }}
        ref={row}
      >
        {children}
      </div>
    </div>
  );
};
