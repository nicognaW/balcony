// Swipe a session row left to settle it, or to un-settle a Settled one. The
// direction lock and threshold come from @balcony/client, shared with the
// web app; here they run as worklets on the UI thread, inside Gesture
// Handler's pan, so the row follows the finger while JS is busy.
import { swipeArmed, swipeAxis, swipeOffset } from "@balcony/client";
import { AndroidHaptics, performAndroidHapticsAsync } from "expo-haptics";
import { CheckCheckIcon, InboxIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { use, useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  GestureDetector,
  GestureStateManager,
  usePanGesture,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { HeldSwipe } from "./held-swipe.ts";
import { Icon } from "./icon.tsx";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Short of the threshold: home, carrying the finger's speed, no overshoot. */
const springHome = (velocity: number) => {
  "worklet";

  return withSpring(0, {
    dampingRatio: 1,
    duration: 300,
    reduceMotion: ReduceMotion.System,
    velocity,
  });
};

/** Android's own threshold ticks, which need no vibrate permission. */
const tick = (armed: boolean) => {
  void performAndroidHapticsAsync(
    armed ? AndroidHaptics.Toggle_On : AndroidHaptics.Toggle_Off
  );
};

// The row's own bounds and corners (the card's rounded-xl) clip it as it
// slides off.
const styles = StyleSheet.create({
  frame: { borderRadius: 12, overflow: "hidden" },
});

/** How long a settled row waits off-screen for the list to move it. */
const MOVE_WAIT_MS = 1500;

/** What shows behind the row as it moves: the action, in colour once armed. */
const Action = ({
  armed,
  settled,
}: {
  readonly armed: boolean;
  readonly settled: boolean;
}) => (
  <View
    className={`flex-1 flex-row items-center justify-end gap-1.5 rounded-xl pr-5 ${armed ? "bg-primary" : "bg-secondary"}`}
  >
    <Icon
      icon={settled ? InboxIcon : CheckCheckIcon}
      size={18}
      tone={armed ? "primary-foreground" : "muted-foreground"}
    />
    <Text
      className={`text-sm font-medium ${armed ? "text-primary-foreground" : "text-muted-foreground"}`}
    >
      {settled ? "Un-settle" : "Settle"}
    </Text>
  </View>
);

export const SwipeToSettle = ({
  children,
  id,
  onSettle,
  settled,
}: {
  readonly children: ReactNode;
  /** The session's id, to match the playground's held swipe. */
  readonly id: string;
  /** Settles or un-settles; rejects when the server refused. */
  readonly onSettle: () => Promise<void>;
  /** Whether the row is Settled now: the swipe un-settles it. */
  readonly settled: boolean;
}) => {
  const held = use(HeldSwipe);
  // Where the row is drawn: 0 at home (or where the playground holds it),
  // negative to the left.
  const x = useSharedValue(held?.session === id ? -held.offset : 0);
  const width = useSharedValue(0);
  // The touch: where it went down, the row's place then, and its axis.
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  const from = useSharedValue(0);
  const axis = useSharedValue<"undecided" | "swipe" | "pass">("undecided");
  // How far the armed colour has come in, 0 to 1.
  const armedShown = useSharedValue(0);
  // Sliding off or waiting on the server: touches pass through.
  const committing = useSharedValue(false);
  const waiting = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(waiting.current), []);

  const comeBack = () => {
    committing.set(false);
    x.set(springHome(0));
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

  useAnimatedReaction(
    () => swipeArmed(x.get(), width.get()),
    (now, before) => {
      if (now === before) {
        return;
      }

      armedShown.set(
        withTiming(now ? 1 : 0, {
          duration: 150,
          easing: EASE_OUT,
          reduceMotion: ReduceMotion.System,
        })
      );

      // Only a finger crossing it ticks, not the playground's held row.
      if (before !== null && axis.get() === "swipe") {
        scheduleOnRN(tick, now);
      }
    }
  );

  const pan = usePanGesture({
    manualActivation: true,
    onDeactivate: (event) => {
      // A swipe the list took back (it began scrolling) never settles.
      if (event.canceled || !swipeArmed(x.get(), width.get())) {
        x.set(springHome(event.velocityX));

        return;
      }

      committing.set(true);
      x.set(
        withTiming(
          -width.get(),
          {
            duration: 200,
            easing: EASE_OUT,
            reduceMotion: ReduceMotion.System,
          },
          (finished) => {
            if (finished === true) {
              scheduleOnRN(commit);
            }
          }
        )
      );
    },
    onTouchesDown: (event) => {
      const [touch] = event.allTouches;

      if (committing.get() || touch === undefined) {
        GestureStateManager.fail(event.handlerTag);

        return;
      }

      downX.set(touch.absoluteX);
      downY.set(touch.absoluteY);
      // Caught mid-spring, the row carries on from where it is.
      from.set(x.get());
      axis.set("undecided");
    },
    onTouchesMove: (event) => {
      const [touch] = event.allTouches;

      if (axis.get() !== "undecided" || touch === undefined) {
        return;
      }

      const decided = swipeAxis(
        touch.absoluteX - downX.get(),
        touch.absoluteY - downY.get()
      );

      axis.set(decided);

      if (decided === "swipe") {
        GestureStateManager.activate(event.handlerTag);
      } else if (decided === "pass") {
        GestureStateManager.fail(event.handlerTag);
      }
    },
    onUpdate: (event) => {
      x.set(swipeOffset(from.get() + event.translationX, width.get()));
    },
  });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
  }));

  // Hidden at home, so its colour never rims the card's rounded corners.
  const behindStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-16, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const armedStyle = useAnimatedStyle(() => ({ opacity: armedShown.get() }));

  // Reanimated drives these styles on the UI thread; classes can't animate.
  /* oxlint-disable shadcn/no-inline-styles */
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(event) => width.set(event.nativeEvent.layout.width)}
        style={styles.frame}
      >
        <Animated.View
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, behindStyle]}
        >
          <Action armed={false} settled={settled} />
          <Animated.View style={[StyleSheet.absoluteFill, armedStyle]}>
            <Action armed settled={settled} />
          </Animated.View>
        </Animated.View>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
  /* oxlint-enable shadcn/no-inline-styles */
};
