# Sessions

Every interactive or automated runtime interaction happens inside a durable session.

`SessionManager` lives under `packages/runtime/src/sessions.ts`.

## Session ID Format

Session IDs use:

```text
<prefix>:<uuid>
```

- the prefix identifies the connector or execution context
- the suffix is a full UUID from `crypto.randomUUID()`
- the prefix may itself contain colons

Examples:

- `main:550e8400-e29b-41d4-a716-446655440000`
- `tui:550e8400-e29b-41d4-a716-446655440001`
- `telegram:123456:550e8400-e29b-41d4-a716-446655440002`
- `cron:daily-summary:550e8400-e29b-41d4-a716-446655440003`

## Session Classes

| Class | Example prefix | Purpose |
| --- | --- | --- |
| Main | `main` | runtime-owned engine-level work |
| Connector | `tui`, `telegram:<chatId>`, `discord:<channelId>`, etc. | user-facing conversations |
| Automation | `cron:<taskName>`, `webhook:<slug>` | isolated automation work |
| Projects-driven execution | `dispatch:<dispatchId>` | runtime execution correlated back to a tracked dispatch |

## Session Lifecycle

1. create or resolve the session
2. bind or resume runtime state
3. run live work within that session
4. persist durable messages and summaries
5. archive longer-lived transcripts and summaries
6. keep the session queryable after active execution ends

## Session Ownership

Frontends do not own session state. They reference runtime sessions through the shared interaction protocol and the runtime auth model.

## Archive Behavior

Session archives preserve:

- transcript history
- summaries
- searchable metadata

`chat.history`, `session.listArchived`, and `session.search` can fall back to archive-backed state when a live agent instance is no longer present.

## Session Utilities

Important session utilities remain:

- `create(prefix, connectorType)`
- `getSession(id)`
- `listSessions()`
- `listByPrefix(prefix)`
- `getLatest(prefix)`
- `touchSession(id)`
- `destroySession(id)`
- `transferSession(id, connectorId, connectorType?)`

## Approval and Relay Interaction

- approval state is durable per run and per session
- relay attachments target runtime sessions, not separate remote session objects
- projects dispatch execution now correlates durable dispatches to runtime session IDs
