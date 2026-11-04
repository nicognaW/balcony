// A row the playground holds swiped partway (its `swipe` link parameter),
// for screenshots of the swipe: CI can't screenshot a finger held still
// reliably.
import type { PlaygroundSwipe } from "@balcony/client/playground";
import { createContext } from "react";

export const HeldSwipe = createContext<PlaygroundSwipe | undefined>(undefined);
