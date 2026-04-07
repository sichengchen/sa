# Sessions

SA uses a structured session system to isolate conversations across connectors, scheduled tasks, and webhook invocations. Every interaction runs inside a session. The `SessionManager` class (`src/engine/sessions.ts`) owns the live in-memory session registry, while `SessionArchiveManager` (`src/engine/session-archive.ts`) persists transcripts, compact summaries, and full-text search metadata to disk.

---

## Session ID format

Every session ID follows `<prefix>:<suffix>`:

- **prefix**: encodes session type and context (connector type, chat ID, task name, slug). May contain colons.
- **suffix**: 8-character hex string from `crypto.randomUUID()`. Always the segment after the **last** colon.

| Full Session ID | Prefix | Suffix |
|---|---|---|
| `main:a1b2c3d4` | `main` | `a1b2c3d4` |
| `tui:e5f6a7b8` | `tui` | `e5f6a7b8` |
| `telegram:123456:c9d0e1f2` | `telegram:123456` | `c9d0e1f2` |
| `discord:789012:g3h4i5j6` | `discord:789012` | `g3h4i5j6` |
| `cron:daily-report:k7l8m9n0` | `cron:daily-report` | `k7l8m9n0` |
| `webhook:deploy:p1q2r3s4` | `webhook:deploy` | `p1q2r3s4` |

---

## 3-tier session model

| Tier | ID pattern | Creator | Purpose |
|---|---|---|---|
| Main | `main:<id>` | Engine startup | Engine-level tasks: heartbeat, orchestration. One per engine lifetime. connectorType = `"engine"`. |
| Connector | `tui:<id>`, `telegram:<chatId>:<id>`, `slack:<channelId>:<id>`, `teams:<channelId>:<id>`, `gchat:<channelId>:<id>`, `discord:<channelId>:<id>`, `github:<channelId>:<id>`, `linear:<channelId>:<id>`, `webhook:<id>` | Connector via `session.create` | User-facing conversations. One agent per session. |
| Automation | `cron:<task-name>:<id>`, `webhook:<slug>:<id>` | Scheduler / webhook handler | Isolated, ephemeral sessions for background tasks. |

### Main session

Created once at engine boot (or resumed via `getLatest("main")`). The heartbeat scheduler runs against its dedicated Agent instance. Accumulates context across heartbeat cycles for the engine lifetime. Exposed via `mainSession.info` tRPC procedure.

### Connector sessions

Created per chat or channel. Each gets isolated message history and agent state.

| Connector | Prefix format | Example |
|---|---|---|
| TUI | `tui` | `tui:a1b2c3d4` |
| Telegram | `telegram:<chatId>` | `telegram:123456789:e5f6a7b8` |
| Slack | `slack:<channelId>` | `slack:C01ABC:c9d0e1f2` |
| Teams | `teams:<channelId>` | `teams:19abc:d3e4f5g6` |
| Google Chat | `gchat:<channelId>` | `gchat:spaces/ABC:h7i8j9k0` |
| Discord | `discord:<channelId>` | `discord:987654321:c9d0e1f2` |
| GitHub | `github:<channelId>` | `github:owner/repo:l1m2n3o4` |
| Linear | `linear:<channelId>` | `linear:team-id:p5q6r7s8` |

On connect, connectors first try `session.getLatest` to resume, then fall back to `session.create`.

### Automation sessions

Ephemeral, isolated, not tied to any user-facing connector. Cron sessions (`cron:<taskName>:<id>`) get a fresh agent per run with no shared context. Webhook sessions (`webhook:<slug>:<id>`) are created per invocation.

---

## SessionManager API

### `create(prefix, connectorType): Session`

Create a new session with a generated random suffix. Returns `Session` with `id`, `connectorType`, `connectorId`, `createdAt`, `lastActiveAt`.

### `getSession(sessionId): Session | undefined`

Retrieve a session by full ID.

### `listSessions(): Session[]`

Return all active sessions.

### `listByPrefix(prefix): Session[]`

Return all sessions whose ID starts with `prefix:`.

### `getLatest(prefix): Session | undefined`

Most recently active session under a prefix (by `lastActiveAt`). Primary mechanism for session resumption.

### `static getPrefix(sessionId): string`

Parse prefix by splitting at last colon. `"telegram:123456:e5f6"` -> `"telegram:123456"`.

### `static getType(sessionId): string`

Parse first segment. `"cron:daily-report:x7y8"` -> `"cron"`.

### `touchSession(sessionId): void`

Update `lastActiveAt` to `Date.now()`. Called on every chat interaction.

### `destroySession(sessionId): boolean`

Remove session from internal map. Returns `true` if existed. Agent and session-level tool overrides cleaned up separately in `session.destroy` tRPC procedure.

### `transferSession(sessionId, targetConnectorId, targetConnectorType?): Session`

Move a session to a different connector. Throws if session does not exist.

---

## /new command behavior

All connectors support `/new` to start a fresh session under the same prefix:

- **TUI**: destroys the current session (removes agent + history), then creates fresh.
- **Telegram/Slack/Teams/Google Chat/Discord/GitHub/Linear**: creates a new session without destroying the old one. Old session history preserved and accessible via `/sessions` or `/switch`.

---

## Session lifecycle

1. **Creation** -- connector calls `session.create` via tRPC. SessionManager allocates ID, returns Session.
2. **Agent binding** -- on first `chat.stream`, `getSessionAgent()` lazily creates an Agent with system prompt, model router, tools, and approval callback. Cached in `sessionAgents` map.
3. **Active use** -- each message calls `touchSession()`. Agent accumulates conversation history.
4. **Archive sync** -- after completed turns, on explicit history reads, and before session destruction, the engine snapshots the current transcript into `session-archive.sqlite`.
5. **Resumption** -- on reconnect, connector calls `session.getLatest` with its prefix to pick up where it left off.
6. **Destruction** -- triggered by `/new` (TUI), explicit `session.destroy`, or engine shutdown. Removes agent, session-level overrides, and session from SessionManager. Archived history remains queryable.

---

## Persistent Archive

Archived sessions are stored in `~/.sa/session-archive.sqlite`.

### Stored data

- Full message transcript with role, content, timestamp, and tool name when applicable
- Compact per-session preview and summary
- FTS5 search document built from summary + transcript excerpts

### Behavior

- `chat.history` first returns live agent history when a session is active.
- If the live agent no longer exists, `chat.history` falls back to the archive.
- `session.list` still returns only live sessions.
- `session.listArchived` returns recent archived sessions.
- `session.search` searches archived transcripts and summaries.

---

## Group chat sessions

In Telegram groups and Discord guild channels, all participants share one session and agent history per chat/channel.

**Sender attribution**: connectors prepend sender name to messages:

```
[Alice]: What time is it?
[Bob]: Can you check the weather?
```

**Mention gating**: the bot only responds when explicitly mentioned (`@botname`) or replied to. Prevents responding to every message in busy groups.

The system prompt includes a group chat directive instructing the agent to address users by name and not confuse different users' messages.

---

## Tool approval and sessions

Tool approval mode is resolved per-session based on `connectorType`. The `getApprovalMode()` function reads `runtime.toolApproval`. Session-level overrides via `tool.acceptForSession` are stored in a `Map<string, Set<string>>` and cleared on session destruction. See `security/approval-flow.md` for the full matrix.
