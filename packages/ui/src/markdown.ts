/** Minimal inline-markdown parser for bold, italic, and inline code. */

export interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/**
 * Parse inline markdown into styled segments.
 * Handles: `code`, **bold**, *italic*
 */
export function parseInlineMarkdown(input: string): Segment[] {
  const segments: Segment[] = [];
  // Match: `code`, **bold**, *italic* (order matters — ** before *)
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

/** Escape HTML entities */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert markdown text to Telegram-safe HTML.
 * Handles: `code`, ```code blocks```, **bold**, *italic*
 */
export function markdownToHtml(input: string): string {
  // First handle fenced code blocks
  let result = input.replace(
    /```(?:\w*\n)?([\s\S]*?)```/g,
    (_m, code: string) => `<pre>${escapeHtml(code.trim())}</pre>`,
  );

  // Then inline patterns
  result = result.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`);
  result = result.replace(/\*\*([^*]+)\*\*/g, (_m, text: string) => `<b>${escapeHtml(text)}</b>`);
  result = result.replace(/\*([^*]+)\*/g, (_m, text: string) => `<i>${escapeHtml(text)}</i>`);

  // Escape remaining HTML-sensitive chars in plain text (skip already-tagged content)
  // We only need to escape & < > that aren't part of our tags
  // Since we already escaped content inside tags, just escape bare & < > outside tags
  result = result.replace(/&(?!amp;|lt;|gt;)/g, "&amp;");

  return result;
}
