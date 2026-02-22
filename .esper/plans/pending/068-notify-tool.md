---
id: 068
title: "Notify tool"
status: pending
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
---

# Notify tool

## Context
SA can receive messages from connectors but has no way to push messages outward from within an agent loop. Scheduled tasks (plan 067) and workflow skills need to notify the user via Telegram or Discord. Currently connectors are pull-based — they subscribe to engine events only when a user sends a message.

The Telegram Bot API is simple HTTPS: `POST https://api.telegram.org/bot<token>/sendMessage`. Discord similarly has a REST API for sending messages. SA already stores bot tokens and paired chat IDs in `secrets.enc`. This means the engine can send notifications directly via HTTP without depending on Grammy or discord.js libraries.

## Approach

### 1. Create `src/engine/tools/notify.ts`
A factory function (like `remember`, `read_skill`) that receives runtime config/secrets:

```ts
export function createNotifyTool(secrets: SecretsFile): ToolImpl
```

Parameters:
- `message: string` — the notification text (supports markdown)
- `connector?: "telegram" | "discord" | "all"` — target connector (default: "all" configured)

Execution:
- **Telegram**: If `secrets.botToken` and `secrets.pairedChatId` exist, POST to Telegram Bot API `sendMessage` endpoint with `parse_mode: "Markdown"`
- **Discord**: If `secrets.discordToken` and a target channel ID exist, POST to Discord REST API. Store a `discordNotifyChannelId` in secrets or config for the target channel.
- Return a summary: `"Sent to: telegram, discord"` or `"Sent to: telegram (discord not configured)"`

Properties:
- `dangerLevel: "safe"` — sending a notification to the owner is not dangerous
- No external dependencies — uses `fetch()` directly

### 2. Register in runtime.ts
Add `createNotifyTool(secrets)` to the tools array in `createRuntime()`, alongside other factory tools.

### 3. Update system prompt
Add `notify` to the tool listing. Add a brief note in `TOOL_CALL_STYLE` or a new section: "Use the notify tool to send messages to the user's Telegram or Discord when they're not actively chatting (e.g., scheduled task results, important alerts)."

### 4. Update bundled SA skill
Add `notify` tool documentation to `src/engine/skills/bundled/sa/SKILL.md`.

## Files to change
- `src/engine/tools/notify.ts` (create — notify tool factory)
- `src/engine/tools/notify.test.ts` (create — unit tests with mock HTTP)
- `src/engine/runtime.ts` (modify — register notify tool)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — document notify tool)

## Verification
- Run: `bun test src/engine/tools/notify.test.ts`
- Expected: Tests pass — mock Telegram/Discord API calls, verify request shape, handle missing config gracefully
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Manual: Configure bot token + paired chat ID, use notify tool in a chat session, verify message arrives on Telegram
- Edge cases: No bot token configured (return helpful error, don't crash); Telegram API rate limit (handle 429 gracefully); message too long (truncate or split)
