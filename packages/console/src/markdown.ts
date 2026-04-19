export interface MarkdownSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export function parseInlineMarkdown(input: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;

  for (const match of input.matchAll(re)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      segments.push({ text: input.slice(lastIndex, idx) });
    }
    const raw = match[0];
    if (raw.startsWith("`")) {
      segments.push({ text: raw.slice(1, -1), code: true });
    } else if (raw.startsWith("**")) {
      segments.push({ text: raw.slice(2, -2), bold: true });
    } else {
      segments.push({ text: raw.slice(1, -1), italic: true });
    }
    lastIndex = idx + raw.length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex) });
  }

  return segments;
}
