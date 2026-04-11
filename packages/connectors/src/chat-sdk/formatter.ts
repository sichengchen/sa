/**
 * Shared formatting utilities for Chat SDK connectors.
 *
 * Provides platform-aware message splitting, tool result formatting,
 * and markdown sanitization.
 */

const DEFAULT_MAX_LENGTH = 4000;

export const PLATFORM_LIMITS: Record<string, number> = {
  slack: 3000,
  teams: 28000,
  gchat: 4096,
  discord: 2000,
  github: 65536,
  linear: 10000,
  telegram: 4096,
  wechat: 1800,
};

export function getMaxLength(platform: string): number {
  return PLATFORM_LIMITS[platform] ?? DEFAULT_MAX_LENGTH;
}

export function formatToolResult(toolName: string, content: string, maxLen = 500): string {
  const truncated = content.length > maxLen ? content.slice(0, maxLen) + "..." : content;
  return `**${toolName}**\n\`\`\`\n${truncated}\n\`\`\``;
}

export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf("\n", maxLength);
    if (breakAt === -1 || breakAt < maxLength / 2) {
      breakAt = maxLength;
    }
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining[breakAt] === "\n"
      ? remaining.slice(breakAt + 1)
      : remaining.slice(breakAt);
  }
  return chunks;
}

export function formatSenderAttribution(displayName: string, text: string): string {
  return `[${displayName}]: ${text}`;
}
