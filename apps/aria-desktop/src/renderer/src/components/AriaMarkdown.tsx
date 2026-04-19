import type { ReactNode } from "react";

type MarkdownBlock =
  | { type: "code"; content: string }
  | { level: number; text: string; type: "heading" }
  | { ordered: boolean; items: string[]; type: "list" }
  | { text: string; type: "paragraph" };

function parseBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ content: codeLines.join("\n"), type: "code" });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        level: headingMatch[1].length,
        text: headingMatch[2] ?? "",
        type: "heading",
      });
      index += 1;
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2] ?? "");
      const items: string[] = [];
      while (index < lines.length) {
        const currentLine = lines[index] ?? "";
        const currentMatch = currentLine.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!currentMatch || /\d+\./.test(currentMatch[2] ?? "") !== ordered) {
          break;
        }
        items.push(currentMatch[3] ?? "");
        index += 1;
      }
      blocks.push({ items, ordered, type: "list" });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const currentLine = lines[index] ?? "";
      if (
        !currentLine.trim() ||
        currentLine.startsWith("```") ||
        /^#{1,6}\s+/.test(currentLine) ||
        /^(\s*)([-*]|\d+\.)\s+/.test(currentLine)
      ) {
        break;
      }
      paragraphLines.push(currentLine);
      index += 1;
    }
    blocks.push({ text: paragraphLines.join("\n"), type: "paragraph" });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const raw = match[0];

    if (index > lastIndex) {
      tokens.push(text.slice(lastIndex, index));
    }

    if (raw.startsWith("`")) {
      tokens.push(<code key={`${index}:code`}>{raw.slice(1, -1)}</code>);
    } else if (raw.startsWith("**")) {
      tokens.push(<strong key={`${index}:bold`}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("*")) {
      tokens.push(<em key={`${index}:italic`}>{raw.slice(1, -1)}</em>);
    } else {
      const linkMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      tokens.push(
        <a key={`${index}:link`} href={linkMatch?.[2] ?? "#"} rel="noreferrer" target="_blank">
          {linkMatch?.[1] ?? raw}
        </a>,
      );
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.flatMap((token, index) =>
    typeof token === "string"
      ? token
          .split("\n")
          .flatMap((line, lineIndex, lines) =>
            lineIndex < lines.length - 1 ? [line, <br key={`${index}:${lineIndex}:br`} />] : [line],
          )
      : [token],
  );
}

export function AriaMarkdown({ content }: { content: string }) {
  return (
    <>
      {parseBlocks(content).map((block, index) => {
        if (block.type === "code") {
          return (
            <pre key={`${index}:code`}>
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === "heading") {
          const Tag = `h${Math.min(block.level, 4)}` as const;
          return <Tag key={`${index}:heading`}>{renderInline(block.text)}</Tag>;
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={`${index}:list`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${index}:${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }

        return <p key={`${index}:paragraph`}>{renderInline(block.text)}</p>;
      })}
    </>
  );
}
