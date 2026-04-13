import type { ToolResult } from "./types.js";

/** Absolute maximum characters per tool result (matching OpenClaw) */
export const HARD_MAX_TOOL_RESULT_CHARS = 400_000;

/** Always preserve at least this many characters when truncating */
export const MIN_KEEP_CHARS = 2_000;

/**
 * Cap tool result size to prevent context bloat.
 *
 * If the result content exceeds the limit, it is truncated and a note
 * is appended indicating the original and truncated sizes.
 *
 * @param result - The tool result to check
 * @param maxChars - Override for the max chars limit (default: HARD_MAX_TOOL_RESULT_CHARS)
 * @returns The original result if under the limit, or a truncated copy
 */
export function capToolResultSize(result: ToolResult, maxChars?: number): ToolResult {
  const limit = maxChars ?? HARD_MAX_TOOL_RESULT_CHARS;
  const originalLength = result.content.length;

  if (originalLength <= limit) {
    return result;
  }

  // Ensure we keep at least MIN_KEEP_CHARS
  const keepChars = Math.max(limit, MIN_KEEP_CHARS);

  // Try to break at a newline boundary in the last 20% of allowed range
  const searchStart = Math.floor(keepChars * 0.8);
  const searchRegion = result.content.slice(searchStart, keepChars);
  const lastNewline = searchRegion.lastIndexOf("\n");

  const breakPoint = lastNewline >= 0 ? searchStart + lastNewline : keepChars;

  const truncated = result.content.slice(0, breakPoint);
  const note = `\n...[truncated from ${originalLength} to ${truncated.length} chars]`;

  return {
    content: truncated + note,
    isError: result.isError,
  };
}
