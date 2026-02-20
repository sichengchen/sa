---
id: 24
title: Telegram Connector
status: done
type: feature
priority: 2
phase: phase-2
branch: feature/phase-2
created: 2026-02-19
shipped_at: 2026-02-20
---
# Telegram Connector

## Context
The Telegram transport (`src/telegram/transport.ts`) directly imports and calls `Agent.chat()`, processes `AgentEvent`s, and manages the Grammy bot. This plan refactors it into a Connector that communicates with the Engine via tRPC while keeping the same Telegram UX (streaming edits, tool result formatting, /pair command).

The existing `TelegramTransport` class handles: message receiving, agent streaming with throttled edits, tool result formatting, /pair pairing, and chat ID filtering.

## Approach
1. Create `src/connectors/telegram/client.ts` — tRPC client for Telegram Connector:
   - Connect to Engine using URL + auth token from `~/.sa/`
   - Create a session on startup
2. Refactor `src/connectors/telegram/transport.ts`:
   - Remove direct `Agent` import — use tRPC client instead
   - On message received: call `chat.send` mutation, subscribe to `chat.stream`
   - Map tRPC `AgentEvent`s to Telegram messages (same streaming edit logic)
   - Handle `tool_approval_request`: send inline keyboard to Telegram user (Approve/Reject buttons)
   - Handle `tool.approve` via callback query handler
3. Keep existing functionality:
   - `splitMessage()` and `formatToolResult()` from `src/telegram/formatter.ts` — move to `src/connectors/telegram/formatter.ts`
   - `/pair` command — now pairs with Engine (not just chat ID filtering)
   - Chat ID filtering remains (Connector-side, not Engine-side)
4. Move files from `src/telegram/` to `src/connectors/telegram/`
5. Update `src/connectors/telegram/index.ts` — Connector entry point

## Files to change
- `src/connectors/telegram/client.ts` (create — tRPC client)
- `src/connectors/telegram/transport.ts` (create — refactored from src/telegram/transport.ts)
- `src/connectors/telegram/formatter.ts` (create — moved from src/telegram/formatter.ts)
- `src/connectors/telegram/index.ts` (create — Connector entry point)
- `src/telegram/` (delete — moved to connectors/telegram/)

## Verification
- Run: `sa engine start && bun run src/connectors/telegram/index.ts`
- Expected: Telegram bot connects to Engine, messages stream as before, /pair still works
- Edge cases: Engine restart while Telegram Connector is running (auto-reconnect), tool approval via inline keyboard

## Progress
- Created connectors/telegram/client.ts — reads engine.url and engine.token
- Created connectors/telegram/transport.ts — TelegramConnector class using tRPC
- Slash commands: /pair, /new (clear session), /status, /model
- Tool approval via inline keyboard (Approve/Reject buttons)
- Streaming edits with throttle, split long messages, MarkdownV2 formatting
- Re-exported formatter from original src/telegram/ for shared logic
- Created: connectors/telegram/client.ts, transport.ts, formatter.ts, index.ts
- Verification: passed (122 tests, lint clean, typecheck clean)
