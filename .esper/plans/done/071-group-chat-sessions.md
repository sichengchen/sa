---
id: 71
title: Group chat sender attribution + sessions
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Group chat sender attribution + sessions

## Context
After plan 070 (mention gating), SA responds in group chats only when addressed. But all group members' messages still merge into one undifferentiated session — the agent can't tell Alice from Bob. Sessions are per-connector-process, not per-chat.

Exploration 005 recommends Approach D (hybrid): text-based sender prefix + group-specific session IDs. This avoids engine-level refactoring while solving the biggest issues.

Plan 072 introduces structured session IDs and refactors `SessionManager` to use `getOrCreate(sessionId, connectorType)`. This plan leverages that convention — connectors use deterministic IDs like `telegram:<chatId>` and `discord:<channelId>` instead of random UUIDs. No connector-side `Map<chatId, sessionId>` tracking is needed.

## Approach

### 1. Per-chat structured session IDs
Instead of one session per connector process, use the structured session ID convention (from plan 072) to create a session per chat/channel. Session IDs follow the `<prefix>:<session-id>` format where prefix encodes type + context:

**Telegram**: Prefix is `telegram:<chatId>`, full ID is `telegram:<chatId>:<session-id>`:
```ts
// Private chat prefix: "telegram:123456"
// Group chat prefix: "telegram:-100987654"
const prefix = `telegram:${ctx.chat.id}`;

// Get existing session or create a new one for this chat
let session = await client.session.getLatest.query({ prefix });
if (!session) {
  session = await client.session.create.mutate({ prefix, connectorType: "telegram" });
}
// session.id = "telegram:123456:a1b2c3"
```

**Discord**: Prefix is `discord:<channelId>`:
```ts
const prefix = `discord:${message.channelId}`;
let session = await client.session.getLatest.query({ prefix });
if (!session) {
  session = await client.session.create.mutate({ prefix, connectorType: "discord" });
}
```

**TUI**: Prefix is `tui`, full ID is `tui:<session-id>`.

**`/new` command**: When a user sends `/new` in any chat, the connector calls `session.create({ prefix, connectorType })` to get a fresh session under the same prefix. The previous session is preserved — history is not lost, just a new conversation thread starts. The connector updates its "active session" pointer for that chat context.

Each connector maintains a `Map<string, string>` of `prefix → activeSessionId` to track which session is current per chat.

### 2. Text-based sender attribution
Prefix group chat messages with the sender's display name before forwarding to the engine:

**Telegram**: `[${ctx.from.first_name}]: ${messageText}`
**Discord**: `[${message.author.displayName}]: ${messageText}`

Only add the prefix in group chats — private chats remain as-is (single user, no ambiguity).

### 3. System prompt group chat guidance
Add a brief section to the system prompt (in `runtime.ts`) or as a dynamic addition when the session is a group:

```
When messages are prefixed with [Name]:, you are in a group chat. Address users by name when relevant. Keep responses concise in group settings. You are still a personal assistant — other users in the group are friends/family of your owner.
```

### 4. Session type — no changes needed
The structured session ID already encodes the chat/channel context (e.g., `telegram:-100987654:a1b2c3` for a group session). No need to add separate `chatId`/`channelId` fields to the `Session` type — the prefix contains the context. Session type and context can be parsed via `getType()` and `getPrefix()` helpers (from plan 072).

### 5. Tests
Test sender attribution formatting, session-per-chat mapping, and private-vs-group behavior.

## Files to change
- `src/connectors/telegram/transport.ts` (modify — use `telegram:<chatId>:<id>` session IDs, `prefix → activeSessionId` map, `/new` support, sender prefix)
- `src/connectors/discord/transport.ts` (modify — use `discord:<channelId>:<id>` session IDs, `prefix → activeSessionId` map, `/new` support, sender prefix)
- `src/connectors/tui/client.ts` (modify — use `tui:<id>` session IDs, `/new` support)
- `src/engine/runtime.ts` (modify — add group chat guidance to system prompt)
- `tests/telegram.test.ts` (modify — test structured session IDs, sender prefix)
- `tests/discord-filter.test.ts` (modify — test structured session IDs, sender prefix)

## Verification
- Run: `bun test tests/telegram.test.ts tests/discord-filter.test.ts`
- Expected: Tests pass for: group messages prefixed with sender name, private messages not prefixed, `telegram:<chatId>:<id>` session IDs use correct prefix, `getLatest` reuses current session, `/new` creates fresh session under same prefix
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Manual: In a Telegram group, have two users talk to the bot — verify the agent addresses them by name and maintains a coherent conversation with both
- Edge cases: User with no display name (fall back to username or "Unknown"); very long display names (truncate); session cleanup when bot leaves a group; negative chat IDs for Telegram groups (e.g., `telegram:-100123456`)

## Progress
- Added `session.getLatest` tRPC procedure for prefix-based session lookup
- Refactored Telegram connector: `activeSessions` Map for per-chat session tracking, `ensureSession(chatId)` with getLatest fallback, `/new` creates fresh session preserving history, sender attribution `[Name]: msg` for group chats
- Refactored Discord connector: same pattern with `activeSessions` Map, `ensureSession(channelId)`, `/new` command, sender attribution using `displayName`
- Added `GROUP_CHAT_GUIDE` section to system prompt in runtime.ts
- Added `formatSenderAttribution()` pure functions to both connectors
- Added 6 sender attribution tests (3 Telegram + 3 Discord)
- Modified: procedures.ts, telegram/transport.ts, telegram/formatter.ts, telegram/index.ts, discord/transport.ts, discord/formatter.ts, discord/index.ts, runtime.ts
- Verification: 411 pass, 9 skip, 0 fail; typecheck clean; lint clean
