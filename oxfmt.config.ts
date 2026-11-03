import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Keep hand-wrapped Markdown (GLOSSARY.md, docs/) as authored.
  proseWrap: "preserve",
});
