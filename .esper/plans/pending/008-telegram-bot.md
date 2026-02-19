---
id: 008
title: Telegram bot integration
status: pending
type: feature
priority: 5
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Telegram bot integration

## Context
SA should be reachable via Telegram as an alternative to the TUI. The Telegram bot receives messages, forwards them to the same Agent runtime, and sends back responses. This allows chatting with SA from a phone or any Telegram client.

## Approach
1. Choose library: `grammy` (lightweight, TypeScript-first, actively maintained)
2. Implement `TelegramTransport` class:
   - `constructor(botToken, agent)` — initializes Grammy bot and links to Agent
   - `start()` — starts long polling
   - `stop()` — graceful shutdown
3. Message handling:
   - `bot.on("message:text")` — forwards text to `agent.chat()`
   - Stream responses back as Telegram messages (send partial → edit for streaming effect, or send complete)
   - Format tool call results as code blocks in Telegram
4. Security:
   - Restrict to a single user by chat ID (configured in `config.json`)
   - Ignore messages from unauthorized users
5. The bot token is stored as an env var (`SA_TELEGRAM_TOKEN`) referenced in config
6. Bot runs alongside the TUI in the same process (or optionally standalone via a `--telegram-only` flag)
7. Write integration test with Grammy's test utilities (or mock)

## Files to change
- `src/telegram/transport.ts` (create — TelegramTransport implementation)
- `src/telegram/formatter.ts` (create — message formatting for Telegram)
- `src/telegram/index.ts` (create — barrel export)
- `src/index.ts` (modify — start Telegram transport alongside TUI)
- `tests/telegram.test.ts` (create — integration tests)

## Verification
- Run: `bun test tests/telegram.test.ts`
- Expected: bot receives message, forwards to agent, sends response, rejects unauthorized users
- Edge cases: bot token invalid, network disconnect, very long responses (Telegram 4096 char limit), rapid messages
