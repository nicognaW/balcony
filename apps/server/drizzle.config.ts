// Used only by `bunx --bun drizzle-kit generate` at development time; the
// server applies the generated migrations itself at start.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
});
