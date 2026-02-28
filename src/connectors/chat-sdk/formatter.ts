/**
 * Shared formatting utilities for Chat SDK connectors.
 *
 * Provides platform-aware message splitting, tool result formatting,
 * and markdown sanitization.
 */

/** Default max message length — platforms override as needed */
const DEFAULT_MAX_LENGTH = 4000;

/** Platform-specific message length limits */
export const PLATFORM_LIMITS: Record<string, number> = {
  slack: 3000,    // Slack blocks have ~3000 char soft limit per block
  teams: 28000,   // Teams Adaptive Cards allow ~28KB
  gchat: 4096,    // Google Chat message limit
  discord: 2000,  // Discord message limit
  github: 65536,  // GitHub comment limit
  linear: 10000,  // Linear comment limit
  telegram: 4096, // Telegram message limit
};

/** Get the message length limit for a platform */
export function getMaxLength(platform: string): number {
  return PLATFORM_LIMITS[platform] ?? DEFAULT_MAX_LENGTH;
}

/** Format a tool result for display */
export function formatToolResult(toolName: string, content: string, maxLen = 500): string {
  const truncated = content.length > maxLen ? content.slice(0, maxLen) + "..." : content;
  return `**${toolName}**\n\`\`\`\n${truncated}\n\`\`\``;
}

/** Split a long message into chunks fitting the platform's limit */
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

/** Format a message with sender attribution for group chats */
export function formatSenderAttribution(displayName: string, text: string): string {
  return `[${displayName}]: ${text}`;
}
