import react from "ultracite/oxlint/react";
import reactNative from "ultracite/oxlint/react-native";

import { reactWorkspace } from "../../oxlint.config.ts";

// react-native has no oxlint rules of its own, so React's come from react.
export default reactWorkspace(react, reactNative);
