// What the session list needs from a Claude transcript (one JSONL file per
// session), folded line by line so a growing file is read only once.
import { Option, Predicate, Schema } from "effect";

const ContentBlock = Schema.Struct({
  text: Schema.optional(Schema.String),
  type: Schema.String,
});

/**
 * The fields Balcony reads from a transcript line. Other fields are ignored,
 * and a line that doesn't fit is skipped: the format is undocumented.
 */
const TranscriptLine = Schema.Struct({
  aiTitle: Schema.optional(Schema.String),
  attachment: Schema.optional(
    Schema.Struct({ type: Schema.optional(Schema.String) })
  ),
  customTitle: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  gitBranch: Schema.optional(Schema.String),
  isCompactSummary: Schema.optional(Schema.Boolean),
  isMeta: Schema.optional(Schema.Boolean),
  message: Schema.optional(
    Schema.Struct({
      content: Schema.optional(
        Schema.Union([Schema.String, Schema.Array(ContentBlock)])
      ),
      /** The API message id, shared by every line of one agent message. */
      id: Schema.optional(Schema.String),
      stop_reason: Schema.optional(Schema.NullOr(Schema.String)),
    })
  ),
  origin: Schema.optional(
    Schema.Struct({ kind: Schema.optional(Schema.String) })
  ),
  summary: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  type: Schema.String,
});

type TranscriptLine = typeof TranscriptLine.Type;

const decodeLine = Schema.decodeUnknownOption(
  Schema.fromJsonString(TranscriptLine)
);

/** What the list needs from one transcript, accumulated over its lines. */
export interface TranscriptSummary {
  /** The `cwd` of the last line that has one. */
  readonly cwd: string | undefined;
  /** The newest `timestamp` of a user or agent line (ISO-8601). */
  readonly lastMessageAt: string | undefined;
  readonly customTitle: string | undefined;
  readonly aiTitle: string | undefined;
  readonly summary: string | undefined;
  /** The first prompt the user typed. */
  readonly firstPrompt: string | undefined;
  /** The branch of the last line that names one. */
  readonly branch: string | undefined;
  /** When the user last typed a prompt. */
  readonly lastUserMessageAt: string | undefined;
  /** When the latest turn began: a prompt, or whatever woke the agent. */
  readonly turnStartedAt: string | undefined;
  /** When the agent last ended a turn. */
  readonly turnEndedAt: string | undefined;
  /** Whether a turn has begun and not ended. */
  readonly inTurn: boolean;
  /** The agent message that ended the last turn; its later lines don't start one. */
  readonly endingMessageId: string | undefined;
}

export const emptySummary: TranscriptSummary = {
  aiTitle: undefined,
  branch: undefined,
  customTitle: undefined,
  cwd: undefined,
  endingMessageId: undefined,
  firstPrompt: undefined,
  inTurn: false,
  lastMessageAt: undefined,
  lastUserMessageAt: undefined,
  summary: undefined,
  turnEndedAt: undefined,
  turnStartedAt: undefined,
};

const MAX_TITLE = 200;

/** The text of a user line, or undefined when it holds tool results. */
const userText = ({ message }: TranscriptLine): string | undefined => {
  const content = message?.content;

  if (content === undefined || Predicate.isString(content)) {
    return content;
  }

  if (content.some((block) => block.type === "tool_result")) {
    return undefined;
  }

  const texts = content.flatMap((block) =>
    block.type === "text" && block.text !== undefined ? [block.text] : []
  );

  return texts.length > 0 ? texts.join("\n") : undefined;
};

const COMMAND = /<command-name>\s*(?<name>[^<]*?)\s*<\/command-name>/u;
const COMMAND_ARGS = /<command-args>\s*(?<args>[\s\S]*?)\s*<\/command-args>/u;

/**
 * The prompt a user line shows as a title, following Claude's own picker:
 * typed prompts and slash commands count; harness-injected text doesn't.
 */
const promptOf = (line: TranscriptLine): string | undefined => {
  const kind = line.origin?.kind;

  if (
    line.isMeta === true ||
    line.isCompactSummary === true ||
    (kind !== undefined && kind !== "human")
  ) {
    return undefined;
  }

  const text = userText(line)?.trim();

  if (
    text === undefined ||
    text === "" ||
    text.startsWith("[Request interrupted")
  ) {
    return undefined;
  }

  if (!text.startsWith("<")) {
    return text;
  }

  const command = COMMAND.exec(text)?.groups?.name;
  const args = COMMAND_ARGS.exec(text)?.groups?.args ?? "";

  if (command === undefined) {
    return undefined;
  }

  return args === "" ? command : `${command} ${args}`;
};

const oneLine = (text: string): string =>
  text.replaceAll(/\s+/gu, " ").trim().slice(0, MAX_TITLE);

const newest = (a: string | undefined, b: string | undefined) => {
  if (a === undefined) {
    return b;
  }

  if (b === undefined) {
    return a;
  }

  return Date.parse(b) > Date.parse(a) ? b : a;
};

type Turn = Pick<
  TranscriptSummary,
  "endingMessageId" | "inTurn" | "turnEndedAt" | "turnStartedAt"
>;

const startTurn = (summary: TranscriptSummary, at: string): Turn => ({
  endingMessageId: undefined,
  inTurn: true,
  turnEndedAt: summary.turnEndedAt,
  turnStartedAt: at,
});

const endTurn = (
  summary: TranscriptSummary,
  at: string,
  messageId: string | undefined
): Turn => ({
  endingMessageId: messageId,
  inTurn: false,
  turnEndedAt: newest(summary.turnEndedAt, at),
  turnStartedAt: summary.turnStartedAt,
});

/** Stop reasons that hand the turn back to the user. */
const TURN_ENDS = new Set([
  "end_turn",
  "max_tokens",
  "refusal",
  "stop_sequence",
]);

/** Harness messages that wake the agent without the user. */
const WAKE_ORIGINS = new Set(["task-notification", "peer"]);

const isInterrupt = (line: TranscriptLine): boolean =>
  userText(line)?.trim().startsWith("[Request interrupted") === true;

/** How a user or agent line moves the turn along. */
const turnAfter = (
  summary: TranscriptSummary,
  line: TranscriptLine,
  at: string
): Turn => {
  if (line.type === "user") {
    if (isInterrupt(line)) {
      return endTurn(summary, at, undefined);
    }

    const kind = line.origin?.kind;

    const wakes =
      promptOf(line) !== undefined ||
      (kind !== undefined && WAKE_ORIGINS.has(kind));

    return wakes ? startTurn(summary, at) : summary;
  }

  const messageId = line.message?.id;

  // Every line of one agent message repeats its stop reason, so the lines
  // after the one that ended a turn don't start another.
  const sameMessage =
    messageId !== undefined && messageId === summary.endingMessageId;

  const started =
    summary.inTurn || sameMessage
      ? summary
      : { ...summary, ...startTurn(summary, at) };

  const stopReason = line.message?.stop_reason;

  return stopReason !== undefined &&
    stopReason !== null &&
    TURN_ENDS.has(stopReason)
    ? endTurn(started, at, messageId)
    : started;
};

/** Folds a user or agent line, whose cwd and branch are already folded. */
const foldMessage = (
  summary: TranscriptSummary,
  line: TranscriptLine
): TranscriptSummary => {
  const prompt = line.type === "user" ? promptOf(line) : undefined;

  const titled: TranscriptSummary = {
    ...summary,
    firstPrompt:
      summary.firstPrompt === undefined && prompt !== undefined
        ? oneLine(prompt)
        : summary.firstPrompt,
  };

  const at = line.timestamp;

  if (at === undefined) {
    return titled;
  }

  return {
    ...titled,
    ...turnAfter(titled, line, at),
    lastMessageAt: newest(summary.lastMessageAt, at),
    lastUserMessageAt: prompt === undefined ? summary.lastUserMessageAt : at,
  };
};

const foldTranscriptLine = (
  summary: TranscriptSummary,
  line: TranscriptLine
): TranscriptSummary => {
  const cwd = line.cwd ?? summary.cwd;
  const branch = line.gitBranch ?? summary.branch;

  switch (line.type) {
    case "user":
    case "assistant": {
      return foldMessage({ ...summary, branch, cwd }, line);
    }

    // A message that arrived while the agent was busy (often a finished
    // background task) and now wakes it.
    case "attachment": {
      const at = line.timestamp;

      return line.attachment?.type === "queued_command" && at !== undefined
        ? { ...summary, ...startTurn(summary, at), branch, cwd }
        : { ...summary, branch, cwd };
    }

    case "custom-title": {
      return {
        ...summary,
        customTitle: line.customTitle ?? summary.customTitle,
        cwd,
      };
    }

    case "ai-title": {
      return { ...summary, aiTitle: line.aiTitle ?? summary.aiTitle, cwd };
    }

    case "summary": {
      return { ...summary, cwd, summary: line.summary ?? summary.summary };
    }

    default: {
      return { ...summary, branch, cwd };
    }
  }
};

/** Folds one raw JSONL line into the summary. Lines that don't parse are skipped. */
export const foldLine = (
  summary: TranscriptSummary,
  text: string
): TranscriptSummary =>
  decodeLine(text).pipe(
    Option.map((line) => foldTranscriptLine(summary, line)),
    Option.getOrElse(() => summary)
  );

/** Claude's title precedence: custom, AI, summary, then the first prompt. */
export const titleOf = (summary: TranscriptSummary): string =>
  summary.customTitle ??
  summary.aiTitle ??
  summary.summary ??
  summary.firstPrompt ??
  "Untitled session";

/** Claude records a detached checkout, or no repository, as `HEAD`. */
const NO_BRANCH = new Set(["", "HEAD"]);

/** The session's branch, or null when it isn't on one. */
export const branchOf = (summary: TranscriptSummary): string | null =>
  summary.branch === undefined || NO_BRANCH.has(summary.branch)
    ? null
    : summary.branch;
