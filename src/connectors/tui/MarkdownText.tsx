import React from "react";
import { Text } from "ink";
import { parseInlineMarkdown } from "@aria/shared/markdown.js";

interface MarkdownTextProps {
  children: string;
}

/** Render inline markdown (bold, italic, code) as styled Ink <Text> elements. */
export function MarkdownText({ children }: MarkdownTextProps) {
  const segments = parseInlineMarkdown(children);
  return (
    <Text>
      {segments.map((seg, i) => {
        if (seg.code) {
          return (
            <Text key={i} color="yellow">
              {seg.text}
            </Text>
          );
        }
        if (seg.bold) {
          return (
            <Text key={i} bold>
              {seg.text}
            </Text>
          );
        }
        if (seg.italic) {
          return (
            <Text key={i} dimColor>
              {seg.text}
            </Text>
          );
        }
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
}
