// One Transcript entry, laid out like T3 Code's timeline: the user's messages
// as bubbles on the right, agent text as markdown, and the agent's steps as
// compact one-line work rows (adapted from T3 Code's WorkLog, MIT,
// (c) 2026 T3 Tools Inc.).
import type { TranscriptEntry } from "@balcony/contracts";
import {
  BanIcon,
  BotIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Icon } from "./icon.tsx";
import { AgentMarkdown } from "./markdown.tsx";

const WorkRow = ({
  children,
  icon,
}: {
  readonly children: ReactNode;
  readonly icon: LucideIcon;
}) => (
  <View className="min-w-0 flex-row items-center gap-2">
    <View className="size-6 items-center justify-center">
      <Icon icon={icon} size={14} />
    </View>
    <Text
      className="text-muted-foreground min-w-0 flex-1 text-sm"
      numberOfLines={1}
    >
      {children}
    </Text>
  </View>
);

/** Something the step looked at, dimmed after its name. */
const Detail = ({ children }: { readonly children: string | undefined }) =>
  children === undefined ? null : (
    <Text className="text-muted-foreground text-xs">{`  ${children}`}</Text>
  );

/** A path as its file name, then the folder it is in, dimmed. */
const FilePath = ({ path }: { readonly path: string }) => {
  const slash = path.lastIndexOf("/");

  return (
    <>
      <Text className="text-foreground">{path.slice(slash + 1)}</Text>
      <Detail>{slash > 0 ? path.slice(0, slash) : undefined}</Detail>
    </>
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
        <View className="items-end">
          <Text
            className="bg-secondary text-secondary-foreground max-w-[85%] overflow-hidden rounded-2xl rounded-br-md px-3.5 py-2 text-base leading-6"
            selectable
          >
            {entry.text}
          </Text>
        </View>
      );
    }

    case "agent-text": {
      return <AgentMarkdown text={entry.text} />;
    }

    case "file-change": {
      return (
        <WorkRow icon={SquarePenIcon}>
          <FilePath path={entry.path} />
        </WorkRow>
      );
    }

    case "command-run": {
      return (
        <WorkRow icon={TerminalIcon}>
          <Text className="text-foreground font-mono text-xs">
            {entry.command}
          </Text>
        </WorkRow>
      );
    }

    case "subagent-started": {
      return (
        <WorkRow icon={BotIcon}>
          <Text className="text-foreground">{entry.description}</Text>
          <Detail>{entry.subagentType}</Detail>
        </WorkRow>
      );
    }

    case "other-step": {
      return (
        <WorkRow icon={entry.label === "Interrupted" ? BanIcon : WrenchIcon}>
          {entry.label}
          <Detail>{entry.detail}</Detail>
        </WorkRow>
      );
    }

    default: {
      return null;
    }
  }
};
