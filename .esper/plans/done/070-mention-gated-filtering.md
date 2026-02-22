---
id: 70
title: Mention-gated IM filtering
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Mention-gated IM filtering

## Context
Both IM connectors (Telegram, Discord) treat group chats identically to private chats — every message that passes the allowlist is forwarded to the engine. In a group chat, this means SA responds to every message (spam behavior). There's no @mention or reply-to-bot detection.

Telegram: `bot.on("message:text", ...)` at line 170. Grammy provides `ctx.message.reply_to_message` and `ctx.message.entities` (for mentions). The bot's username is available via `bot.botInfo.username`.

Discord: `discord.on("messageCreate", ...)` at line 165. Discord.js provides `message.mentions.has(client.user)` and `message.reference` (for replies). Bot's own user ID is `discord.user.id`.

Private chats should always pass through — filtering only applies to group chats. Note: plan 071 will change connectors to use structured session IDs (`telegram:<chatId>`, `discord:<channelId>`), but this plan focuses purely on the filtering logic and doesn't need to change session handling.

## Approach

### 1. Telegram mention/reply gate
In `src/connectors/telegram/transport.ts`, add a check before processing text messages:

```ts
// In the message:text handler
const isGroupChat = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
if (isGroupChat) {
  const isMentioned = ctx.message.entities?.some(
    e => e.type === "mention" && ctx.message.text?.slice(e.offset, e.offset + e.length) === `@${bot.botInfo.username}`
  );
  const isReply = ctx.message.reply_to_message?.from?.id === bot.botInfo.id;
  if (!isMentioned && !isReply) return; // ignore message
}
```

Strip the `@botname` prefix from the message text before forwarding to the engine.

### 2. Discord mention/reply gate
In `src/connectors/discord/transport.ts`, add a similar check:

```ts
const isGroupChat = message.guild !== null;
if (isGroupChat) {
  const isMentioned = message.mentions.has(discord.user!);
  const isReply = message.reference?.messageId && /* replied to bot's message */;
  if (!isMentioned && !isReply) return;
}
```

Strip the `<@botId>` mention from message content before forwarding.

### 3. Also apply to audio/voice messages
Both connectors handle voice messages — apply the same gate (reply-to-bot only, since you can't @mention in voice).

### 4. Tests
Test the filtering logic in isolation — extract the "should respond" check into a pure function that can be unit tested with mock message objects.

## Files to change
- `src/connectors/telegram/transport.ts` (modify — add mention/reply gate for group chats)
- `src/connectors/discord/transport.ts` (modify — add mention/reply gate for group chats)
- `tests/telegram.test.ts` (modify — add group chat filtering tests)
- `tests/discord-filter.test.ts` (create — Discord group chat filtering tests)

## Verification
- Run: `bun test tests/telegram.test.ts tests/discord-filter.test.ts`
- Expected: Tests pass for: private chat passes through, group chat without mention ignored, group chat with @mention passes, group chat reply-to-bot passes, mention text stripped from forwarded message
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Manual: Add SA bot to a Telegram group, send a normal message (ignored), @mention the bot (responds), reply to bot's message (responds)
- Edge cases: Bot mentioned mid-sentence (should still trigger); multiple mentions in one message; empty message after stripping mention

## Progress
- Implemented Telegram group chat gate: `shouldRespondInGroup()` + `stripBotMention()` pure functions in formatter.ts, integrated in message:text and voice handlers
- Implemented Discord group chat gate: `shouldRespondInGuild()` + `stripBotMention()` pure functions in formatter.ts, integrated in messageCreate and audio handlers
- Added 17 Telegram group filtering tests (10 shouldRespondInGroup + 6 stripBotMention + 1 edge case)
- Created tests/discord-filter.test.ts with 12 Discord filtering tests (5 shouldRespondInGuild + 7 stripBotMention)
- Modified: telegram/formatter.ts, telegram/index.ts, telegram/transport.ts, discord/formatter.ts, discord/index.ts, discord/transport.ts, tests/telegram.test.ts, tests/discord-filter.test.ts
- Verification: 405 pass, 9 skip, 0 fail; typecheck clean; lint clean
