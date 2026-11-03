// A temporary home folder filled with the fixture Claude files in
// test/fixtures (see test/fixtures/manifest.json for what each one covers).
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";

const fixtures = fileURLToPath(new URL("fixtures", import.meta.url));

interface Manifest {
  readonly sessions: Record<string, { readonly sessionId: string }>;
  readonly statusFiles: Record<string, { readonly pid: "live" | "dead" }>;
}

const manifest: Manifest = JSON.parse(
  await readFile(path.join(fixtures, "manifest.json"), "utf-8")
);

/** The fixture session ids by manifest name (`working`, `waiting`, …). */
export const fixtureSessions = Object.fromEntries(
  Object.entries(manifest.sessions).map(([name, { sessionId }]) => [
    name,
    sessionId,
  ])
);

export interface FixtureHome {
  readonly home: string;
  readonly claude: string;
  /** The status file that now stands for a fixture's status file name. */
  readonly statusFile: (fixtureName: string) => string;
}

/** A process that lives until the scope closes, so its pid counts as alive. */
const liveProcess = Effect.acquireRelease(
  Effect.sync(() => Bun.spawn(["sleep", "600"])),
  (child) => Effect.sync(() => child.kill())
);

/** The pid of a process that has exited. */
const deadPid = Effect.promise(async () => {
  const child = Bun.spawn(["true"]);
  await child.exited;

  return child.pid;
});

/**
 * Copies the fixture home into a temp folder. Status files whose manifest pid
 * is "live" are renamed to the pid of a running child process, and "dead"
 * ones to the pid of an exited one, because Balcony checks pid liveness.
 */
export const fixtureHome = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(path.join(tmpdir(), "balcony-home-"))),
  (home) => Effect.promise(() => rm(home, { force: true, recursive: true }))
).pipe(
  Effect.tap((home) =>
    Effect.promise(() =>
      cp(path.join(fixtures, "home"), home, { recursive: true })
    )
  ),
  Effect.flatMap((home) =>
    Effect.gen(function* fillHome() {
      const sessionsDir = path.join(home, ".claude", "sessions");
      const renamed = new Map<string, string>();

      for (const [name, { pid: kind }] of Object.entries(
        manifest.statusFiles
      )) {
        const pid = kind === "live" ? (yield* liveProcess).pid : yield* deadPid;

        const from = path.join(sessionsDir, name);
        const to = path.join(sessionsDir, `${pid}.json`);
        const text = yield* Effect.promise(() => readFile(from, "utf-8"));

        // A text edit, so torn records stay torn.
        yield* Effect.promise(async () => {
          await rename(from, to);
          await writeFile(to, text.replace(/"pid":\d+/u, `"pid":${pid}`));
        });
        renamed.set(name, to);
      }

      const result: FixtureHome = {
        claude: path.join(home, ".claude"),
        home,
        statusFile: (fixtureName) => {
          const file = renamed.get(fixtureName);

          if (file === undefined) {
            throw new Error(`No fixture status file ${fixtureName}`);
          }

          return file;
        },
      };

      return result;
    })
  )
);
