// The playground's scenarios: built-in sessions and Transcripts for checking
// the apps' screens with no Balcony server. Times are relative to `now`, so
// the list reads "5m ago" whenever it is opened.
import type { Session, TranscriptEntry } from "@balcony/contracts";

/**
 * The fake server's connection: the three a real link reports, plus
 * `refused`, a server that no longer accepts the token.
 */
export type PlaygroundConnectionState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "refused";

/** How the fake server answers a short pairing code. */
export type FakePairing = "accept" | "wrong" | "expired" | "locked";

export type ScenarioId =
  | "busy-day"
  | "empty"
  | "edge-cases"
  | "connecting"
  | "reconnecting"
  | "refused"
  | "pairing-wrong"
  | "pairing-expired"
  | "pairing-locked";

export interface ScenarioData {
  readonly sessions: readonly Session[];
  /** Sessions with no entry here have no Transcript (NOT_FOUND). */
  readonly transcripts: ReadonlyMap<string, readonly TranscriptEntry[]>;
}

export interface Scenario {
  readonly id: ScenarioId;
  readonly label: string;
  /** What the scenario is for, one line. */
  readonly description: string;
  readonly group: "Data" | "Connection" | "Pairing";
  /** The screen the scenario opens on. */
  readonly screen: "sessions" | "pair";
  readonly connection: PlaygroundConnectionState;
  /** The server address the pairing screen and the list's footer show. */
  readonly server: string;
  readonly pairing: FakePairing;
  /**
   * The sessions live changes go to: Transcript appends to `appendTo`,
   * status changes to `toggle`. Absent when nothing changes by itself.
   */
  readonly live?: { readonly appendTo: string; readonly toggle: string };
  readonly data: (now: number) => ScenarioData;
}

const MINUTE = 60_000;

/** The pretend address of the playground's server. */
export const PLAYGROUND_SERVER = "http://192.168.1.20:7766";

/** The ISO time `minutes` before `now`. */
const ago = (now: number, minutes: number) =>
  new Date(now - minutes * MINUTE).toISOString();

const session = (
  fields: Pick<Session, "id" | "title" | "project"> & Partial<Session>
): Session => ({
  agent: "claude",
  branch: null,
  lastMessageAt: "1970-01-01T00:00:00.000Z",
  lastUserMessageAt: null,
  lastViewedAt: null,
  settledAt: null,
  status: "waiting",
  turnEndedAt: null,
  turnStartedAt: null,
  unsettledAt: null,
  ...fields,
});

/** A session whose turn began `minutes` ago and is still going. */
const working = (
  now: number,
  minutes: number,
  fields: Pick<Session, "id" | "title" | "project"> & Partial<Session>
) =>
  session({
    lastMessageAt: ago(now, 0.2),
    lastUserMessageAt: ago(now, minutes),
    lastViewedAt: ago(now, minutes),
    status: "working",
    turnStartedAt: ago(now, minutes),
    ...fields,
  });

/** A session whose turn ended `minutes` ago, seen after it (or never). */
const waiting = (
  now: number,
  minutes: number,
  fields: Pick<Session, "id" | "title" | "project"> & Partial<Session>,
  viewed: "after" | "before" | "never" = "after"
) =>
  session({
    lastMessageAt: ago(now, minutes),
    lastUserMessageAt: ago(now, minutes + 4),
    lastViewedAt:
      viewed === "never"
        ? null
        : ago(now, viewed === "after" ? minutes - 1 : minutes + 2),
    turnEndedAt: ago(now, minutes),
    turnStartedAt: ago(now, minutes + 4),
    ...fields,
  });

/** A session settled `minutes` ago, quiet since. */
const settled = (
  now: number,
  minutes: number,
  fields: Pick<Session, "id" | "title" | "project"> & Partial<Session>
) => ({
  ...waiting(now, minutes + 30, fields),
  settledAt: ago(now, minutes),
});

type EntryFields =
  | { readonly kind: "user-message"; readonly text: string }
  | { readonly kind: "agent-text"; readonly text: string }
  | { readonly kind: "file-change"; readonly path: string }
  | {
      readonly kind: "subagent-started";
      readonly description: string;
      readonly subagentType?: string;
    }
  | {
      readonly kind: "command-run";
      readonly command: string;
      readonly description?: string;
    }
  | {
      readonly kind: "other-step";
      readonly label: string;
      readonly detail?: string;
    };

/** Entries with ids `<sessionId>-<n>`, a few seconds apart up to `endsAt`. */
const transcript = (
  sessionId: string,
  endsAt: string,
  fields: readonly EntryFields[]
): TranscriptEntry[] => {
  const end = Date.parse(endsAt);

  return fields.map((entry, index) => ({
    ...entry,
    at: new Date(end - (fields.length - 1 - index) * 7000).toISOString(),
    id: `${sessionId}-${String(index + 1)}`,
  }));
};

const user = (text: string) => ({ kind: "user-message", text }) as const;
const agent = (text: string) => ({ kind: "agent-text", text }) as const;
const edit = (path: string) => ({ kind: "file-change", path }) as const;

const run = (command: string, description?: string) =>
  description === undefined
    ? ({ command, kind: "command-run" } as const)
    : ({ command, description, kind: "command-run" } as const);

const subagent = (description: string, subagentType?: string) =>
  subagentType === undefined
    ? ({ description, kind: "subagent-started" } as const)
    : ({ description, kind: "subagent-started", subagentType } as const);

const step = (label: string, detail?: string) =>
  detail === undefined
    ? ({ kind: "other-step", label } as const)
    : ({ detail, kind: "other-step", label } as const);

/** A short exchange for a session with nothing particular to show. */
const plainTranscript = (target: Session) =>
  transcript(target.id, target.lastMessageAt, [
    user(`Can you look at this: ${target.title}`),
    step("Read", `src/${target.project}.ts`),
    run("bun run test", "Run the tests"),
    agent(
      "Done. The tests pass, and the change is in **one file**. Want me to open a PR?"
    ),
  ]);

const withPlainTranscripts = (
  sessions: readonly Session[],
  special: Record<string, readonly TranscriptEntry[]> = {},
  without: ReadonlySet<string> = new Set()
): ScenarioData => ({
  sessions,
  transcripts: new Map(
    sessions.flatMap((target) =>
      without.has(target.id)
        ? []
        : [[target.id, special[target.id] ?? plainTranscript(target)] as const]
    )
  ),
});

const busyDay = (now: number): ScenarioData => {
  const auth = working(now, 3, {
    branch: "auth-tokens",
    id: "pg-auth",
    project: "balcony",
    title: "Move the auth middleware onto the shared token helper",
  });

  const sessions = [
    auth,
    working(now, 12, {
      branch: "fix/paging",
      id: "pg-paging",
      project: "balcony",
      title: "Fix the flaky Transcript paging test",
    }),
    waiting(
      now,
      5,
      {
        branch: "main",
        id: "pg-notes",
        project: "docs-site",
        title: "Write the release notes for 0.3",
      },
      "before"
    ),
    waiting(now, 25, {
      branch: "ci/android",
      id: "pg-ci",
      project: "balcony",
      title: "Why does the Android build fail on CI?",
    }),
    waiting(
      now,
      70,
      {
        branch: "forms-v2",
        id: "pg-forms",
        project: "dashboard",
        title: "Migrate the settings page to the new form components",
      },
      "never"
    ),
    waiting(now, 180, {
      branch: "rate-limit",
      id: "pg-review",
      project: "api",
      title: "Review PR #482: rate limiting per token",
    }),
    settled(now, 200, {
      branch: "renovate/all",
      id: "pg-deps",
      project: "dashboard",
      title: "Bump dependencies",
    }),
    settled(now, 320, {
      branch: "main",
      id: "pg-leak",
      project: "api",
      title: "Investigate the memory leak in the worker",
    }),
  ];

  return withPlainTranscripts(sessions, {
    "pg-auth": transcript(auth.id, auth.lastMessageAt, [
      user(
        "The auth middleware still compares tokens with ===. Move it onto the shared helper, and add a test."
      ),
      step("Grep", "token ==="),
      step("Read", "apps/server/src/rpc.ts"),
      step("Read", "apps/server/src/same-secret.ts"),
      agent(
        '`rpc.ts` compares the token directly, which leaks timing. `sameSecret` already does a constant-time compare, so I\'ll use it there:\n\n```ts\nconst authed = os.middleware(({ context, next }) => {\n  if (!sameSecret(context.token, context.serverToken)) {\n    throw new ORPCError("UNAUTHORIZED");\n  }\n  return next();\n});\n```'
      ),
      edit("apps/server/src/rpc.ts"),
      edit("apps/server/test/connection.test.ts"),
      run("bun run --filter @balcony/server test", "Run the server tests"),
      agent(
        "All 41 tests pass. I also found two more places that compare secrets:\n\n1. `pairing-code.ts` compares the short code\n2. `http.test.ts` has a helper that does the same\n\nShould I move those too?"
      ),
      user("Yes, both."),
      edit("apps/server/src/pairing-code.ts"),
    ]),
    "pg-ci": transcript("pg-ci", ago(now, 25), [
      user("Why does the Android build fail on CI?"),
      subagent("Read the failing workflow run's log", "general-purpose"),
      step("Subagent finished"),
      agent(
        "Gradle runs out of memory while bundling. The runner has 7 GB and the default `org.gradle.jvmargs` asks for 4 GB, plus Metro.\n\n| Option | Build time | Risk |\n| --- | --- | --- |\n| Build arm64 only | −40% | none |\n| Raise the heap | same | OOM again later |\n\nBuilding arm64 only is the better fix."
      ),
    ]),
  });
};

const LONG_MARKDOWN = `# Plan for the session list

The list has **three sections**: Working, the inbox, and Settled. Each row shows the project, the mark (\`Working 3m\`, \`Done\` or a time), the title and the branch.

## Ordering

1. Working sessions, longest-running first
2. Everything else, by the newest of:
   - the user's last message
   - the agent's last turn start
   - the agent's last turn end
     - nested lists keep their indent
3. Settled, most recently settled first

> Settling a session moves it out of the inbox until it has new activity. Claude is never told.

## Code

\`\`\`ts
export const settledPage = (rows: readonly SessionRow[], more: number) => {
  const shown = SETTLED_FIRST_PAGE + more * SETTLED_PAGE;
  return { hidden: Math.max(0, rows.length - shown), rows: rows.slice(0, shown) };
};
\`\`\`

A line of code with no breaks: \`const aVeryLongIdentifierThatGoesOnAndOnWithoutAnyBreaksAtAll = somethingElseEntirely();\`

## Comparison

| Client | Sections | Paging | Live |
| --- | --- | --- | --- |
| Web | 3 | Show more | yes |
| Android | 3 | Show more | yes |
| T3 Code mobile | 2 | infinite scroll | yes |

A wide table:

| Agent | Project | Branch | Status | Started | Ended | Viewed | Settled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude | northwind-industries-holdings | dependabot/npm_and_yarn/vite-7.4.12 | working | 09:14 | — | 09:20 | — |
| claude | x | j | waiting | 08:02 | 08:40 | never | 1,284 times |

- [x] Working section
- [x] Settled section
- [ ] Swipe to settle

See [the T3 Code repository](https://github.com/pingdotgg/t3code) for where this comes from. A URL with no link text: https://example.com/a/very/long/path/that/keeps/going/and/going/until/it/wraps

---

That's the plan. *Italic*, **bold**, ~~struck~~ and \`code\` all in one line.`;

/** One of every entry kind the Transcript can hold. */
const everyKind = (id: string, endsAt: string) =>
  transcript(id, endsAt, [
    user("A plain message from the user."),
    user("/review src/session-list.ts"),
    user("! git status"),
    agent("Agent text, as **markdown** with `code`."),
    edit("apps/mobile/src/screens/sessions-screen.tsx"),
    edit("README.md"),
    subagent("Find every caller of settledPage", "general-purpose"),
    subagent("A subagent with no type"),
    run("bun run check", "Run the checks"),
    run(
      "git log --oneline --since=yesterday -- apps/mobile packages/client | head -50"
    ),
    step("Read", "packages/client/src/session-list.ts"),
    step("Grep", "settledPage\\("),
    step("WebFetch", "https://docs.expo.dev/versions/latest/"),
    step("TodoWrite"),
    step("Interrupted"),
    step("Subagent finished"),
    step("Message from a session", "pg-auth"),
    step("Command output"),
    step("Notice", "API Error: 529 Overloaded"),
    // Worst cases for each kind.
    user(
      "Unbreakable: https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved&highlight=bartholomew.fitzgerald@northwind-industries-holdings.example.com"
    ),
    user("Line one\nLine two\n\n<script>alert(1)</script> &amp; **not bold**"),
    user("👍🏽"),
    user("j"),
    agent("ok"),
    edit(
      "apps/mobile/src/features/sessions/components/very/deeply/nested/folder/structure/that/keeps/going/SessionListRowWithAVeryLongComponentName.tsx"
    ),
    edit("Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf"),
    subagent(
      "Read every workflow run from the last two weeks, find the ones that failed on the Android emulator step, and summarise the logcat output of each, grouped by the crash's stack trace",
      "a-very-long-custom-subagent-type-name"
    ),
    run(
      "cat <<'EOF' > /tmp/claude-0/-home-user-balcony/scratchpad/notes/a-very-long-file-name-for-a-heredoc.md\nline one\nline two\nEOF",
      "Write a note with a heredoc, across several lines, with a description that also runs long"
    ),
    step(
      "mcp__claude-in-chrome__read_page_with_a_long_tool_name",
      "https://example.com/a/very/long/path/that/keeps/going/and/going/until/it/wraps?and=has&a=query"
    ),
    step("Read", "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f.jsonl"),
    agent("修复完成。نهاية المحادثة. The last entry: every kind above."),
  ]);

/** 200 entries, for "Load earlier" across ten pages. */
const longTranscript = (id: string, endsAt: string) =>
  transcript(
    id,
    endsAt,
    Array.from({ length: 200 }, (_, index): EntryFields => {
      const n = String(index + 1);

      switch (index % 5) {
        case 0: {
          return user(`Message ${n}: keep going with the next step.`);
        }

        case 1: {
          return step("Read", `src/step-${n}.ts`);
        }

        case 2: {
          return edit(`src/step-${n}.ts`);
        }

        case 3: {
          return run(`bun run test -- step-${n}`, `Test step ${n}`);
        }

        default: {
          return agent(`Entry ${n}: step done, tests pass.`);
        }
      }
    })
  );

const edgeCases = (now: number): ScenarioData => {
  const kinds = waiting(now, 2, {
    branch: "playground/every-kind",
    id: "edge-kinds",
    project: "balcony",
    title: "Every Transcript entry kind",
  });

  const markdown = waiting(now, 4, {
    branch: "playground/markdown",
    id: "edge-markdown",
    project: "balcony",
    title: "Long markdown: code, tables, lists",
  });

  const long = waiting(now, 6, {
    branch: "playground/200-entries",
    id: "edge-long",
    project: "balcony",
    title: "A 200-entry Transcript (Load earlier)",
  });

  const sessions = [
    working(now, 95, {
      branch:
        "feature/a-very-long-branch-name-that-does-not-fit-on-one-line-of-the-row",
      id: "edge-long-title",
      project: "a-project-with-a-rather-long-folder-name-too",
      title:
        "A very long title that goes on well past the width of the row: rewrite the whole pairing flow so it works offline, with tests, docs and a migration guide for anyone upgrading",
    }),
    kinds,
    markdown,
    long,
    waiting(
      now,
      9,
      {
        branch: "fix/🐛-emoji",
        id: "edge-emoji",
        project: "emoji 🎉",
        title: "🚀 Ship it 🎉 — fix the 🐛 in the 🧪 tests 👀👍🏽",
      },
      "before"
    ),
    waiting(now, 15, {
      branch: "修复/排序",
      id: "edge-cjk",
      project: "日本語のプロジェクト",
      title: "修复会话列表的排序问题，并为分页添加测试",
    }),
    waiting(now, 40, {
      branch: "תיקון-מיון",
      id: "edge-rtl",
      project: "פרויקט",
      title: "إصلاح ترتيب قائمة الجلسات وإضافة اختبارات",
    }),
    waiting(now, 61, {
      id: "edge-no-branch",
      project: "scratch",
      title: "A session outside any repository (no branch)",
    }),
    waiting(now, 130, {
      branch: "main",
      id: "edge-no-transcript",
      project: "balcony",
      title: "A session whose Transcript can't be read",
    }),
    // Worst cases from the break-ui catalogue, one per row.
    working(now, 1520, {
      branch: "j",
      id: "edge-one-letter",
      project: "x",
      title: "J",
    }),
    waiting(now, 200, {
      branch: "main",
      id: "edge-untitled",
      project: "balcony",
      title: "",
    }),
    waiting(now, 260, {
      branch:
        "dependabot/npm_and_yarn/apps/web/vite-and-vitest-7.4.12-security-patch-for-cve-2026-41233",
      id: "edge-unbreakable",
      project: "northwind-industries-holdings-internal-tooling-monorepo",
      title:
        "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved",
    }),
    waiting(now, 300, {
      branch: "fix/escaping",
      id: "edge-markup",
      project: "Aleksandra Wiśniewska-Kowalczyk's notes",
      title: "Line one\nLine two: <script>alert(1)</script> &amp; **not bold**",
    }),
    waiting(now, 340, {
      branch: "Benachrichtigungseinstellungen",
      id: "edge-diacritics",
      project: "Đặng Thị Ngọc Hân",
      title: "Sửa lỗi hiển thị dấu tiếng Việt trong tiêu đề ở chế độ tối",
    }),
    waiting(now, 1430, {
      branch: "main",
      id: "edge-old",
      project: "balcony",
      title: "Nearly a day ago",
    }),
    ...Array.from({ length: 60 }, (_, index) =>
      settled(now, 60 + index * 45, {
        branch: index % 3 === 0 ? null : `settled/${String(index + 1)}`,
        id: `edge-settled-${String(index + 1)}`,
        project: ["balcony", "api", "dashboard"][index % 3] ?? "balcony",
        title: `Settled session ${String(index + 1)}`,
      })
    ),
  ];

  return withPlainTranscripts(
    sessions,
    {
      "edge-kinds": everyKind(kinds.id, kinds.lastMessageAt),
      "edge-long": longTranscript(long.id, long.lastMessageAt),
      "edge-markdown": transcript(markdown.id, markdown.lastMessageAt, [
        user("Write up the plan for the session list."),
        agent(LONG_MARKDOWN),
      ]),
      "edge-rtl": transcript("edge-rtl", ago(now, 40), [
        user("أصلح ترتيب قائمة الجلسات من فضلك"),
        agent(
          "تم. القائمة الآن مرتبة حسب آخر نشاط، مع **اختبار** جديد.\n\nעברית: הרשימה ממוינת לפי הפעילות האחרונה."
        ),
      ]),
    },
    new Set(["edge-no-transcript"])
  );
};

const busyAs = (
  fields: Pick<
    Scenario,
    "id" | "label" | "description" | "group" | "connection" | "pairing"
  > &
    Partial<Scenario>
): Scenario => ({
  data: busyDay,
  live: { appendTo: "pg-auth", toggle: "pg-paging" },
  screen: "sessions",
  server: PLAYGROUND_SERVER,
  ...fields,
});

/** Every scenario, in the order the playground panel lists them. */
export const scenarios: readonly Scenario[] = [
  busyAs({
    connection: "connected",
    description:
      "Working, Waiting, Done and Settled; statuses change and Transcripts grow live.",
    group: "Data",
    id: "busy-day",
    label: "Busy day",
    pairing: "accept",
  }),
  {
    connection: "connected",
    data: () => ({ sessions: [], transcripts: new Map() }),
    description: "No sessions in the last 24 hours.",
    group: "Data",
    id: "empty",
    label: "Empty list",
    pairing: "accept",
    screen: "sessions",
    server: PLAYGROUND_SERVER,
  },
  {
    connection: "connected",
    data: edgeCases,
    description:
      "Long titles and branches, emoji, CJK and RTL, no branch, 60 Settled, every entry kind, long markdown, 200 entries.",
    group: "Data",
    id: "edge-cases",
    label: "Edge cases",
    pairing: "accept",
    screen: "sessions",
    // The longest address balcony prints: a link-local IPv6 one.
    server: "http://[fe80::1ff:fe23:4567:890a]:7766",
  },
  busyAs({
    connection: "connecting",
    description: "No socket has opened yet.",
    group: "Connection",
    id: "connecting",
    label: "Connecting",
    pairing: "accept",
  }),
  busyAs({
    connection: "reconnecting",
    description: "The socket dropped: the list stays, nothing changes.",
    group: "Connection",
    id: "reconnecting",
    label: "Reconnecting",
    pairing: "accept",
  }),
  busyAs({
    connection: "refused",
    description: "The server no longer accepts this phone's token.",
    group: "Connection",
    id: "refused",
    label: "Token refused",
    pairing: "accept",
  }),
  busyAs({
    connection: "connected",
    description: "Every code is wrong, with the tries left, until it locks.",
    group: "Pairing",
    id: "pairing-wrong",
    label: "Wrong code",
    pairing: "wrong",
    screen: "pair",
  }),
  busyAs({
    connection: "connected",
    description: "The code timed out or was already used.",
    group: "Pairing",
    id: "pairing-expired",
    label: "Expired code",
    pairing: "expired",
    screen: "pair",
  }),
  busyAs({
    connection: "connected",
    description: "Too many wrong tries: even the right code is refused.",
    group: "Pairing",
    id: "pairing-locked",
    label: "Locked",
    pairing: "locked",
    screen: "pair",
  }),
];

export const scenarioOf = (id: ScenarioId): Scenario => {
  const found = scenarios.find((scenario) => scenario.id === id);

  if (found === undefined) {
    throw new Error(`No playground scenario ${id}`);
  }

  return found;
};

/** Entries the live appends cycle through, a turn of work at a time. */
export const LIVE_ENTRIES: readonly EntryFields[] = [
  step("Read", "apps/server/src/pairing-code.ts"),
  edit("apps/server/src/pairing-code.ts"),
  run("bun run --filter @balcony/server test", "Run the server tests"),
  agent("Moved. The pairing code now uses `sameSecret` too; tests pass."),
  step("Grep", "=== token"),
  edit("apps/server/test/http.test.ts"),
  agent("And the test helper. Nothing else compares secrets directly."),
];
