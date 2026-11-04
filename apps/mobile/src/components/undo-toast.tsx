// "Settled · Undo" over the bottom of the list, after a swipe or a screen
// reader's Settle. It rises 8dp as it fades in over 200ms and sinks as it
// fades out, following Android's "Remove animations" setting.
import type { SettleNotice } from "@balcony/client/react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
} from "react-native-reanimated";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const rise = FadeInDown.duration(200)
  .easing(EASE_OUT)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
  .reduceMotion(ReduceMotion.System);

const sink = FadeOutDown.duration(150)
  .easing(EASE_OUT)
  .reduceMotion(ReduceMotion.System);

export const UndoToast = ({
  notice,
  onUndo,
}: {
  readonly notice: SettleNotice | null;
  readonly onUndo: () => void;
}) => (
  // Always mounted, so the notice inside can animate out.
  <View
    accessibilityLiveRegion="polite"
    className="absolute inset-x-3 bottom-3"
    pointerEvents="box-none"
  >
    {notice === null ? null : (
      <Animated.View entering={rise} exiting={sink}>
        <View className="bg-foreground flex-row items-center rounded-xl py-1 pr-1 pl-4">
          <Text className="text-background flex-1 text-sm">{notice.label}</Text>
          <Pressable
            accessibilityHint={
              notice.settled
                ? "Un-settles the session"
                : "Settles the session again"
            }
            accessibilityRole="button"
            className="rounded-lg px-4 py-2.5 active:opacity-60"
            hitSlop={4}
            onPress={onUndo}
          >
            <Text className="text-background text-sm font-semibold">Undo</Text>
          </Pressable>
        </View>
      </Animated.View>
    )}
  </View>
);
