// Claude transcript lines as normalised Transcript entries. One assistant line
// holds one content block; a user line is a prompt, a tool result or
// something the harness injected. See the notes in claude-source.ts.
import type { TranscriptEntry } from "@balcony/contracts";
import { Option, Predicate } from "effect";

import { decodeLine, slashCommandOf, userText } from "./transcript.ts";
import type { ToolInput, TranscriptLine } from "./transcript.ts";

/** The tool input fields Balcony shows, when they hold text. */
const toolFields = (input: ToolInput) => {
  const text = (key: string) => {
    const value = input[key];

    return Predicate.isString(value) ? value : undefined;
  };

  return {
    command: text("command"),
    description: text("description"),
    filePath: text("file_path"),
    notebookPath: text("notebook_path"),
    path: text("path"),
    pattern: text("pattern"),
    query: text("query"),
    skill: text("skill"),
    subagentType: text("subagent_type"),
    url: text("url"),
  };
};

type Entry = TranscriptEntry;

/** The entry fields every kind shares. */
interface Base {
  readonly id: string;
  readonly at?: string;
}

const FILE_TOOLS = new Set(["Edit", "MultiEdit", "Write"]);
const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);

const toolEntry = (base: Base, name: string, toolInput: ToolInput): Entry => {
  const input = toolFields(toolInput);

  if (FILE_TOOLS.has(name) && input.filePath !== undefined) {
    return { ...base, kind: "file-change", path: input.filePath };
  }

  if (name === "NotebookEdit" && input.notebookPath !== undefined) {
    return { ...base, kind: "file-change", path: input.notebookPath };
  }

  if (name === "Bash" && input.command !== undefined) {
    return {
      ...base,
      command: input.command,
      description: input.description,
      kind: "command-run",
    };
  }

  if (SUBAGENT_TOOLS.has(name)) {
    return {
      ...base,
      description: input.description ?? "Subagent",
      kind: "subagent-started",
      subagentType: input.subagentType,
    };
  }

  return {
    ...base,
    detail:
      input.filePath ??
      input.notebookPath ??
      input.pattern ??
      input.url ??
      input.query ??
      input.skill ??
      input.path,
    kind: "other-step",
    label: name,
  };
};

const assistantEntries = (line: TranscriptLine, uuid: string): Entry[] => {
  const content = line.message?.content;

  const blocks = Predicate.isString(content)
    ? [{ text: content, type: "text" }]
    : (content ?? []);

  // Errors and notices the harness writes in the agent's name.
  const synthetic =
    line.isApiErrorMessage === true || line.message?.model === "<synthetic>";

  return blocks.flatMap((block, index): Entry[] => {
    const base: Base = {
      at: line.timestamp,
      id: index === 0 ? uuid : `${uuid}:${index}`,
    };

    if (block.type === "text") {
      const text = block.text?.trim() ?? "";

      if (text === "") {
        return [];
      }

      return synthetic
        ? [{ ...base, detail: text, kind: "other-step", label: "Notice" }]
        : [{ ...base, kind: "agent-text", text }];
    }

    if (block.type === "tool_use" && block.name !== undefined) {
      return [toolEntry(base, block.name, block.input ?? {})];
    }

    // Thinking is stored empty; nothing else is shown.
    return [];
  });
};

/** Wrappers the harness puts around text that isn't the user's prompt. */
const SHELL_INPUT = /^<bash-input>(?<command>[\s\S]*?)<\/bash-input>/u;
const SHELL_OUTPUT = /^<(?:bash-stdout|bash-stderr|local-command-stdout)>/u;

const userEntries = (line: TranscriptLine, uuid: string): Entry[] => {
  if (line.isMeta === true || line.isCompactSummary === true) {
    return [];
  }

  // Tool results (undefined text) belong to their tool's row.
  const text = userText(line)?.trim();

  if (text === undefined || text === "") {
    return [];
  }

  const base: Base = { at: line.timestamp, id: uuid };
  const kind = line.origin?.kind;

  if (kind === "task-notification") {
    return [{ ...base, kind: "other-step", label: "Subagent finished" }];
  }

  if (kind === "peer") {
    return [{ ...base, kind: "other-step", label: "Message from a session" }];
  }

  if (kind !== undefined && kind !== "human") {
    return [];
  }

  if (text.startsWith("[Request interrupted")) {
    return [{ ...base, kind: "other-step", label: "Interrupted" }];
  }

  if (!text.startsWith("<")) {
    return [{ ...base, kind: "user-message", text }];
  }

  const command = slashCommandOf(text);

  if (command !== undefined) {
    return [{ ...base, kind: "user-message", text: command }];
  }

  const shell = SHELL_INPUT.exec(text)?.groups?.command;

  if (shell !== undefined) {
    return [{ ...base, kind: "user-message", text: `! ${shell}` }];
  }

  if (SHELL_OUTPUT.test(text)) {
    return [{ ...base, kind: "other-step", label: "Command output" }];
  }

  // Other harness wrappers (caveats, notifications) aren't the user's words.
  return text.startsWith("<task-notification>")
    ? [{ ...base, kind: "other-step", label: "Subagent finished" }]
    : [];
};

/** The entries one raw JSONL line contributes; none for lines that don't parse. */
export const entriesOfLine = (text: string): readonly Entry[] => {
  const decoded = decodeLine(text);

  if (Option.isNone(decoded)) {
    return [];
  }

  const line = decoded.value;

  if (line.uuid === undefined) {
    return [];
  }

  switch (line.type) {
    case "user": {
      return userEntries(line, line.uuid);
    }

    case "assistant": {
      return assistantEntries(line, line.uuid);
    }

    default: {
      return [];
    }
  }
};
