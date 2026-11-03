// Agent text as formatted markdown (GitHub flavour), parsed with mdast and
// drawn with React Native views, styled like the web app's. Raw HTML is shown
// as text and images by their alt text. Links open in the browser.
import type { Nodes, PhrasingContent, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";

const parse = (text: string) =>
  fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

/** A node's key: where it starts in the text, unique among its siblings. */
const keyOf = (node: Nodes): string =>
  `${node.type}@${String(node.position?.start.offset ?? "")}`;

const openLink = async (url: string) => {
  // Only web links; the agent's text could hold any scheme.
  if (/^https?:\/\//iu.test(url)) {
    await Linking.openURL(url);
  }
};

/** Inline content, rendered inside a <Text>. */
const inline = (nodes: readonly PhrasingContent[]): ReactNode[] =>
  nodes.map((node) => {
    switch (node.type) {
      case "text":
      case "html": {
        return node.value;
      }

      case "strong": {
        return (
          <Text className="font-semibold" key={keyOf(node)}>
            {inline(node.children)}
          </Text>
        );
      }

      case "emphasis": {
        return (
          <Text className="italic" key={keyOf(node)}>
            {inline(node.children)}
          </Text>
        );
      }

      case "delete": {
        return (
          <Text className="line-through" key={keyOf(node)}>
            {inline(node.children)}
          </Text>
        );
      }

      case "inlineCode": {
        return (
          <Text className="bg-muted font-mono text-sm" key={keyOf(node)}>
            {node.value}
          </Text>
        );
      }

      case "link": {
        return (
          <Text
            accessibilityRole="link"
            className="text-primary underline"
            key={keyOf(node)}
            onPress={() => openLink(node.url)}
          >
            {inline(node.children)}
          </Text>
        );
      }

      case "image": {
        return node.alt ?? "";
      }

      case "break": {
        return "\n";
      }

      default: {
        return "children" in node ? inline(node.children) : null;
      }
    }
  });

const Paragraph = ({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) => (
  <Text className={`text-foreground text-base leading-6 ${className}`}>
    {children}
  </Text>
);

const HEADING_SIZES = ["text-xl", "text-lg"];

/** A block node and, through `blocks`, everything inside it. */
const block = (node: RootContent): ReactNode => {
  const key = keyOf(node);

  switch (node.type) {
    case "paragraph": {
      return <Paragraph key={key}>{inline(node.children)}</Paragraph>;
    }

    case "heading": {
      return (
        <Paragraph
          className={`font-semibold ${HEADING_SIZES[node.depth - 1] ?? ""}`}
          key={key}
        >
          {inline(node.children)}
        </Paragraph>
      );
    }

    case "code": {
      return (
        <ScrollView
          className="bg-muted rounded-lg"
          contentContainerClassName="p-3"
          horizontal
          key={key}
        >
          <Text className="text-foreground font-mono text-xs leading-4.5">
            {node.value}
          </Text>
        </ScrollView>
      );
    }

    case "blockquote": {
      return (
        <View className="border-border gap-3 border-l-2 pl-3" key={key}>
          {node.children.map(block)}
        </View>
      );
    }

    case "list": {
      const start = node.start ?? 1;

      return (
        <View className="gap-1" key={key}>
          {node.children.map((item, index) => (
            <View className="flex-row gap-2" key={keyOf(item)}>
              <Paragraph className="min-w-4">
                {node.ordered === true ? `${String(start + index)}.` : "•"}
              </Paragraph>
              <View className="min-w-0 flex-1 gap-1">
                {item.checked === null || item.checked === undefined ? null : (
                  <Paragraph>{item.checked ? "☑" : "☐"}</Paragraph>
                )}
                {item.children.map(block)}
              </View>
            </View>
          ))}
        </View>
      );
    }

    case "table": {
      return (
        <ScrollView horizontal key={key}>
          <View className="border-border rounded-lg border">
            {node.children.map((row, rowIndex) => (
              <View
                className={`flex-row ${rowIndex > 0 ? "border-border border-t" : ""}`}
                key={keyOf(row)}
              >
                {row.children.map((cell) => (
                  <Text
                    className={`text-foreground w-36 px-2 py-1 text-xs ${rowIndex === 0 ? "font-semibold" : ""}`}
                    key={keyOf(cell)}
                  >
                    {inline(cell.children)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }

    case "thematicBreak": {
      return <View className="border-border border-t" key={key} />;
    }

    case "html": {
      return <Paragraph key={key}>{node.value}</Paragraph>;
    }

    default: {
      return "children" in node ? (
        <View className="gap-3" key={key}>
          {node.children.map(block)}
        </View>
      ) : null;
    }
  }
};

export const AgentMarkdown = ({ text }: { readonly text: string }) => {
  const root = useMemo(() => parse(text), [text]);

  return <View className="gap-3">{root.children.map(block)}</View>;
};
