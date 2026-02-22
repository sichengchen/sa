const TELEGRAM_MAX_LENGTH = 4096;

/** Format tool call result for Telegram display */
export function formatToolResult(toolName: string, content: string): string {
  const truncated =
    content.length > 500 ? content.slice(0, 500) + "…" : content;
  return `🔧 *${escapeMarkdown(toolName)}*\n\`\`\`\n${truncated}\n\`\`\``;
}

/** Split a long message into chunks that fit Telegram's limit */
export function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    // Try to break at a newline
    let breakAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH);
    if (breakAt === -1 || breakAt < TELEGRAM_MAX_LENGTH / 2) {
      breakAt = TELEGRAM_MAX_LENGTH;
    }
    chunks.push(remaining.slice(0, breakAt));
    // Skip the newline character if we broke at one
    remaining = remaining[breakAt] === "\n"
      ? remaining.slice(breakAt + 1)
      : remaining.slice(breakAt);
  }
  return chunks;
}

/** Escape special characters for Telegram MarkdownV2 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/** Pure helper — returns true if the message is from an allowed sender */
export function isMessageAllowed(allowedChatId: number | undefined, chatId: number): boolean {
  return allowedChatId === undefined || allowedChatId === chatId;
}

/** Input for group chat mention/reply filtering */
export interface TelegramGroupFilterInput {
  chatType: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
  text?: string;
  botUsername: string;
  replyToMessageFromId?: number;
  botId: number;
}

/**
 * Pure helper — returns true if the bot should respond to this message.
 * Private chats always pass. Group chats require an @mention or reply-to-bot.
 */
export function shouldRespondInGroup(input: TelegramGroupFilterInput): boolean {
  const isGroupChat = input.chatType === "group" || input.chatType === "supergroup";
  if (!isGroupChat) return true;

  const isMentioned = input.entities?.some(
    (e) =>
      e.type === "mention" &&
      input.text?.slice(e.offset, e.offset + e.length).toLowerCase() === `@${input.botUsername.toLowerCase()}`,
  ) ?? false;

  const isReply = input.replyToMessageFromId === input.botId;

  return isMentioned || isReply;
}

/** Strip the @botname mention from message text */
export function stripBotMention(text: string, botUsername: string): string {
  return text.replace(new RegExp(`@${botUsername}\\s*`, "gi"), "").trim();
}

/** Pure helper — validates that the user-supplied pairing code matches the expected one */
export function validatePairingCode(input: string | undefined, expected: string | undefined): boolean {
  if (!expected || !input) return false;
  return input.trim().toUpperCase() === expected.toUpperCase();
}
