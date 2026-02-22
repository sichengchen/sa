const DISCORD_MAX_LENGTH = 2000;

/** Format tool result for Discord display */
export function formatToolResult(toolName: string, content: string): string {
  const truncated = content.length > 500 ? content.slice(0, 500) + "..." : content;
  return `**${toolName}**\n\`\`\`\n${truncated}\n\`\`\``;
}

/** Input for guild (group) chat mention/reply filtering */
export interface DiscordGroupFilterInput {
  isGuild: boolean;
  mentionedBot: boolean;
  isReplyToBot: boolean;
}

/**
 * Pure helper — returns true if the bot should respond to this message.
 * DMs always pass. Guild messages require an @mention or reply-to-bot.
 */
export function shouldRespondInGuild(input: DiscordGroupFilterInput): boolean {
  if (!input.isGuild) return true;
  return input.mentionedBot || input.isReplyToBot;
}

/** Strip the <@botId> mention from message text */
export function stripBotMention(text: string, botId: string): string {
  return text.replace(new RegExp(`<@!?${botId}>\\s*`, "g"), "").trim();
}

/** Format a message with sender attribution for guild chats */
export function formatSenderAttribution(displayName: string, text: string): string {
  return `[${displayName}]: ${text}`;
}

/** Split a long message into chunks fitting Discord's 2000 char limit */
export function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf("\n", DISCORD_MAX_LENGTH);
    if (breakAt === -1 || breakAt < DISCORD_MAX_LENGTH / 2) {
      breakAt = DISCORD_MAX_LENGTH;
    }
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining[breakAt] === "\n"
      ? remaining.slice(breakAt + 1)
      : remaining.slice(breakAt);
  }
  return chunks;
}
