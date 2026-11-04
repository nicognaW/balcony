// Whether the page is on screen, not in a background tab or a hidden window.
import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);

  return () => document.removeEventListener("visibilitychange", listener);
};

const isVisible = () => document.visibilityState === "visible";

export const usePageVisible = (): boolean =>
  useSyncExternalStore(subscribe, isVisible);
