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
  customTitle: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  isCompactSummary: Schema.optional(Schema.Boolean),
  isMeta: Schema.optional(Schema.Boolean),
  message: Schema.optional(
    Schema.Struct({
      content: Schema.optional(
        Schema.Union([Schema.String, Schema.Array(ContentBlock)])
      ),
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
}

export const emptySummary: TranscriptSummary = {
  aiTitle: undefined,
  customTitle: undefined,
  cwd: undefined,
  firstPrompt: undefined,
  lastMessageAt: undefined,
  summary: undefined,
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

const foldTranscriptLine = (
  summary: TranscriptSummary,
  line: TranscriptLine
): TranscriptSummary => {
  const cwd = line.cwd ?? summary.cwd;

  switch (line.type) {
    case "user":
    case "assistant": {
      const prompt =
        line.type === "user" && summary.firstPrompt === undefined
          ? promptOf(line)
          : undefined;

      return {
        ...summary,
        cwd,
        firstPrompt:
          prompt === undefined ? summary.firstPrompt : oneLine(prompt),
        lastMessageAt: newest(summary.lastMessageAt, line.timestamp),
      };
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
      return { ...summary, cwd };
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
