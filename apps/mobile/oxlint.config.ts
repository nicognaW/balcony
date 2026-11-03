import { defineConfig } from "oxlint";
import reactNative from "ultracite/oxlint/react-native";

import root from "../../oxlint.config.ts";

// Oxlint lints each file with its nearest config alone, so this extends the
// root config and repeats the properties that extends doesn't carry over.
export default defineConfig({
  env: root.env,
  extends: [root, reactNative],
  ignorePatterns: root.ignorePatterns,
  settings: root.settings,
});
