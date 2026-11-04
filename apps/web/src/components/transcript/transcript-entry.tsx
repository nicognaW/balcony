// One Transcript entry, laid out like T3 Code's timeline: the user's messages
// as bubbles on the right, agent text as markdown, and the agent's steps as
// compact one-line work rows (adapted from T3 Code's WorkLog, MIT,
// (c) 2026 T3 Tools Inc.).
import { fileNameParts } from "@balcony/client/transcript";
import type { TranscriptEntry } from "@balcony/contracts";
import {
  BanIcon,
  BotIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AgentMarkdown } from "./markdown.tsx";

const WorkRow = ({
  children,
  icon: Icon,
  title,
}: {
  readonly children: ReactNode;
  readonly icon: LucideIcon;
  readonly title?: string;
}) => (
  <div
    className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm"
    title={title}
  >
    <span className="flex size-6 shrink-0 items-center justify-center">
      <Icon aria-hidden className="size-3.5" />
    </span>
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </div>
);

/**
 * A path as its file name, cut in the middle when it doesn't fit so its
 * extension stays, then the folder it is in, dimmed, which gives way first.
 */
const FilePath = ({ path }: { readonly path: string }) => {
  const { folder, nameEnd, nameStart } = fileNameParts(path);

  return (
    <span className="flex min-w-0 items-baseline">
      <span className="text-foreground flex max-w-full shrink-0">
        <span className="truncate whitespace-pre">{nameStart}</span>
        <span className="shrink-0 whitespace-pre">{nameEnd}</span>
      </span>
      {folder === undefined ? null : (
        <span className="ml-1.5 min-w-0 truncate text-xs">{folder}</span>
      )}
    </span>
  );
};

export const TranscriptEntryRow = ({
  entry,
}: {
  readonly entry: TranscriptEntry;
}) => {
  switch (entry.kind) {
    case "user-message": {
      return (
        <div className="flex justify-end">
          <p className="bg-secondary text-secondary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {entry.text}
          </p>
        </div>
      );
    }

    case "agent-text": {
      return <AgentMarkdown text={entry.text} />;
    }

    case "file-change": {
      return (
        <WorkRow icon={SquarePenIcon} title={entry.path}>
          <FilePath path={entry.path} />
        </WorkRow>
      );
    }

    case "command-run": {
      return (
        <WorkRow icon={TerminalIcon} title={entry.description}>
          <code className="text-foreground font-mono text-xs">
            {entry.command}
          </code>
        </WorkRow>
      );
    }

    case "subagent-started": {
      return (
        <WorkRow icon={BotIcon} title={entry.subagentType}>
          <span className="text-foreground">{entry.description}</span>
          {entry.subagentType === undefined ? null : (
            <span className="ml-1.5 text-xs">{entry.subagentType}</span>
          )}
        </WorkRow>
      );
    }

    case "other-step": {
      return (
        <WorkRow
          icon={entry.label === "Interrupted" ? BanIcon : WrenchIcon}
          title={entry.detail}
        >
          {entry.label}
          {entry.detail === undefined ? null : (
            <span className="ml-1.5 text-xs">{entry.detail}</span>
          )}
        </WorkRow>
      );
    }

    default: {
      return null;
    }
  }
};
