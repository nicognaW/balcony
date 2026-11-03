import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import shadcn from "ultracite/oxlint/shadcn";

/**
 * Files no one edits: generated code (TanStack Router's route tree, the
 * types Uniwind's Metro plugin writes) and fixtures copied from real agent
 * files (some deliberately malformed). Formatting is skipped for them too.
 */
export const generatedFiles = [
  "**/routeTree.gen.ts",
  "**/uniwind-types.d.ts",
  "apps/server/test/fixtures/**",
];

const root = defineConfig({
  env: core.env,
  extends: [core, antiSlop],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...generatedFiles],
  rules: {
    // Effect Schema's idiom declares a schema and its type under one name
    // (`const Session = Schema.Struct(…)` + `type Session = …`). TypeScript
    // already rejects real redeclarations.
    "no-redeclare": "off",
  },
});

export default root;

const reactDoctor = selectJsPlugins(["react-doctor"]);

/**
 * The config for a React workspace: the root config plus the given framework
 * presets and the React-only plugins (react-doctor, shadcn). Oxlint lints each
 * file with its nearest config alone and doesn't carry `env`,
 * `ignorePatterns`, `jsPlugins` or `settings` over through `extends`, so they
 * are repeated here.
 */
export const reactWorkspace = (...presets: OxlintConfig[]): OxlintConfig =>
  defineConfig({
    env: root.env,
    extends: [root, ...presets, shadcn, reactDoctor],
    ignorePatterns: root.ignorePatterns,
    jsPlugins: [...reactDoctor.jsPlugins, ...shadcn.jsPlugins],
    settings: jsPluginSettings,
  });
