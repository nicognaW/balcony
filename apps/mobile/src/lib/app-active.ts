// Whether the app is in the foreground (AppState `active`), not in the
// background or behind the system's app switcher.
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

const subscribe = (listener: () => void) => {
  const subscription = AppState.addEventListener("change", listener);

  return () => subscription.remove();
};

const isActive = () => AppState.currentState === "active";

export const useAppActive = (): boolean =>
  useSyncExternalStore(subscribe, isActive);
