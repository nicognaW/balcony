// Agent text as formatted markdown (GitHub flavour). Raw HTML in the text is
// shown as text, never rendered, and images are shown by their alt text.
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, href }) => (
    <a
      className="text-primary underline underline-offset-2"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="text-muted-foreground border-l-2 pl-3">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      className={
        className === undefined
          ? "bg-muted rounded px-1 py-0.5 font-mono"
          : `${className} font-mono`
      }
    >
      {children}
    </code>
  ),
  h1: ({ children }) => <h1 className="text-lg font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
  hr: () => <hr className="border-border" />,
  img: ({ alt }) => <span className="text-muted-foreground">{alt}</span>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5">{children}</ol>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  td: ({ children }) => <td className="border-t px-2 py-1">{children}</td>,
  th: ({ children }) => <th className="px-2 py-1 font-semibold">{children}</th>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5">{children}</ul>
  ),
};

const remarkPlugins = [remarkGfm];

export const AgentMarkdown = ({ text }: { readonly text: string }) => (
  <div className="flex flex-col gap-3 text-sm leading-relaxed break-words">
    <Markdown components={components} remarkPlugins={remarkPlugins}>
      {text}
    </Markdown>
  </div>
);
