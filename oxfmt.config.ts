import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

import { generatedFiles } from "./oxlint.config.ts";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...generatedFiles],
  // Keep hand-wrapped Markdown (GLOSSARY.md, docs/) as authored.
  proseWrap: "preserve",
});
