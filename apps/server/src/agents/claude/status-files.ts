// Claude's live status records: `~/.claude/sessions/<pid>.json`, one per
// running Claude process. Undocumented, so every record is checked and
// anything unexpected is ignored.
import type { SessionStatus } from "@balcony/contracts";
import { Option, Schema } from "effect";

const STATUS_FILE = /^(?<pid>\d+)\.json$/u;

/**
 * The pid a status record's file name stands for, or undefined for anything
 * else in the folder (never the `.key` secrets).
 */
export const statusFilePid = (name: string): number | undefined => {
  const digits = STATUS_FILE.exec(name)?.groups?.pid;
  const pid = Number(digits);

  // Claude itself skips names like `0041.json` whose number reads differently.
  return digits !== undefined && String(pid) === digits ? pid : undefined;
};

const STATUSES = {
  busy: "working",
  idle: "waiting",
  shell: "working",
  // Blocked on a dialog. Balcony can't answer it, so it's the user's move.
  waiting: "waiting",
} as const satisfies Record<string, SessionStatus>;

const StatusRecord = Schema.Struct({
  pid: Schema.Number,
  sessionId: Schema.String,
  status: Schema.Literals(["busy", "idle", "shell", "waiting"]),
  statusUpdatedAt: Schema.optional(Schema.Number),
});

const decodeStatusRecord = Schema.decodeUnknownOption(
  Schema.fromJsonString(StatusRecord)
);

/** Whether a process is running. A crashed Claude leaves its record behind. */
const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

export interface LiveStatus {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly updatedAt: number;
}

/**
 * The status a record gives, or undefined when it can't be trusted: torn or
 * unknown content, or a process that is no longer running.
 */
export const parseStatusFile = (
  pid: number,
  text: string
): LiveStatus | undefined =>
  decodeStatusRecord(text).pipe(
    Option.filter((record) => record.pid === pid && isAlive(pid)),
    Option.map((record) => ({
      sessionId: record.sessionId,
      status: STATUSES[record.status],
      updatedAt: record.statusUpdatedAt ?? 0,
    })),
    Option.getOrUndefined
  );
