// The app's two bits of motion, on Reanimated so they run on the UI thread:
// live Transcript entries fading in, and the Working spinner. Both follow
// Android's "Remove animations" setting (ReduceMotion.System).
import type { ReactNode } from "react";
import { useEffect } from "react";
import Animated, {
  Easing,
  FadeInUp,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * A live entry rises 4dp as it fades in, over 200ms, easing out: enough to
 * notice a new line, never enough to move the reader's place.
 */
const arrive = FadeInUp.duration(200)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 4 }] })
  .reduceMotion(ReduceMotion.System);

/**
 * Fades its children in and up as it mounts, when `animate` is set then.
 * Rows mounted otherwise (the first page, earlier pages, a row scrolled back
 * into view) appear at once.
 */
export const FadeIn = ({
  animate,
  children,
}: {
  readonly animate: boolean;
  readonly children: ReactNode;
}) => (
  <Animated.View entering={animate ? arrive : undefined}>
    {children}
  </Animated.View>
);

/** Turns its children once every 3s, as the web's `animate-spin-slow`. */
export const Spin = ({ children }: { readonly children: ReactNode }) => {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      return;
    }

    turn.set(
      withRepeat(withTiming(360, { duration: 3000, easing: Easing.linear }), -1)
    );

    return () => cancelAnimation(turn);
  }, [reduced, turn]);

  const spinning = useAnimatedStyle(() => ({
    transform: [{ rotate: `${String(turn.get())}deg` }],
  }));

  return (
    // oxlint-disable-next-line shadcn/no-inline-styles -- Reanimated drives this style on the UI thread; classes can't animate.
    <Animated.View style={spinning}>{children}</Animated.View>
  );
};
