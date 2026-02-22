---
id: 72
title: Main session + heartbeat overhaul
status: done
type: feature
priority: 1
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Main session + heartbeat overhaul

## Context
SA currently has no concept of an engine-level main session. Sessions are created by connectors when they connect. The heartbeat (`createHeartbeatTask` in `scheduler.ts`) just writes a JSON health file every 5 minutes — it doesn't involve the agent at all.

Phase 6 introduces a **3-tier session model**:
- **Main session**: Persistent on the engine, created at startup, not tied to any connector. The heartbeat runs here with full conversational context. Accumulates long-term awareness across cycles.
- **Connector sessions**: Per connector or per chat (group chat support in plans 070-071).
- **Cron sessions**: Isolated, on demand (plan 067).

The main session is the foundation for the heartbeat overhaul: it runs at a configurable interval (default 30 min), reads a `HEARTBEAT.md` checklist, and lets the agent batch multiple periodic checks in one turn. If nothing needs attention, the agent replies `HEARTBEAT_OK` and no notification is delivered.

**Heartbeat vs Cron decision guide:**
| Use Case | Mechanism | Why |
|----------|-----------|-----|
| Check inbox every 30 min | Heartbeat | Batches with other checks, context-aware |
| Send daily report at 9am | Cron (isolated) | Exact timing needed |
| Monitor calendar for upcoming events | Heartbeat | Natural fit for periodic awareness |
| Run weekly deep analysis | Cron (isolated) | Standalone, can use different model |
| Remind me in 20 minutes | Cron (one-shot) | Precise timing |

## Approach

### 1. Establish the main session + structured session IDs

**Structured session ID convention**: Session IDs use a `<prefix>:<session-id>` format. The prefix encodes the type and context; the session-id is a unique suffix. Users can `/new` to create a fresh session within the same context (prefix), preserving the previous session's history.

Format: `<prefix>:<session-id>`
- `main:<id>` — engine-level main session (singleton)
- `cron:<task-name>:<id>` — isolated cron task sessions (plan 067)
- `telegram:<chatId>:<id>` — Telegram per-chat sessions (plan 071)
- `discord:<channelId>:<id>` — Discord per-channel sessions (plan 071)
- `tui:<id>` — TUI connector sessions
- `webhook:<slug>:<id>` — webhook-triggered task sessions (plan 073)

**Refactor `SessionManager`** to support this:
- `create(prefix, connectorType) → Session` — creates a new session with a generated unique suffix under the given prefix (e.g., `create("main", "engine")` → session ID `main:a1b2c3`)
- `getSession(fullId) → Session` — get by full session ID
- `listByPrefix(prefix) → Session[]` — list all sessions under a prefix (e.g., all sessions for `telegram:123456`)
- `getLatest(prefix) → Session` — get the most recently active session for a prefix
- `getPrefix(sessionId) → string` — parse the prefix (e.g., `"cron:daily-report:x7y8"` → `"cron:daily-report"`, `"main:a1b2"` → `"main"`)
- `getType(sessionId) → string` — parse the type (e.g., `"telegram:123:x7y8"` → `"telegram"`)
- Remove old `createSession(connectorId, connectorType)` with UUID generation.

**Create the main session** in `runtime.ts` at engine startup:
```ts
// Create or resume the main session
let mainSession = sessions.getLatest("main");
if (!mainSession) {
  mainSession = sessions.create("main", "engine");
}
const mainAgent = createAgent();
sessionAgents.set(mainSession.id, mainAgent);
```

Add `"engine"` to `ConnectorType` in `shared/types.ts`. The main session:
- Prefix is always `"main"`, full ID is `main:<id>` — one session lives under this prefix
- Is created once at startup and resumed on restart (via `getLatest("main")`)
- Has its own agent with full tool access
- Accumulates conversation history across heartbeat cycles
- Is available via `runtime.mainSessionId` for other subsystems

Expose `mainSessionId` on `EngineRuntime` so procedures and the scheduler can access it.

**Update `/new` command** in all connectors: `/new` calls `sessions.create(prefix, connectorType)` with the same prefix to get a fresh session, then switches the connector's active session pointer. The old session is preserved.

### 2. Add HeartbeatConfig to AutomationConfig
In `src/engine/config/types.ts` (extends the AutomationConfig from plan 067):
```ts
interface HeartbeatConfig {
  enabled: boolean;          // default true
  intervalMinutes: number;   // default 30
  checklistPath?: string;    // default "HEARTBEAT.md" in SA_HOME
  suppressToken: string;     // default "HEARTBEAT_OK"
}
```

### 3. Create `~/.sa/HEARTBEAT.md` default checklist
During `createRuntime()`, create a default `HEARTBEAT.md` if missing:
```markdown
# Heartbeat checklist
- Check if any background tasks have completed — summarize results
- If idle for 8+ hours, send a brief check-in
```
Users edit this file to customize what the agent checks on each heartbeat.

### 4. Overhaul the heartbeat task
Replace `createHeartbeatTask()` with a new implementation:

1. **Read HEARTBEAT.md** from `SA_HOME`
2. **Run mainAgent.chat()** in the main session — the agent has full context from prior heartbeats and system events
3. **System prompt preamble**: "This is a heartbeat check. Review the checklist and handle each item. If nothing needs attention, reply with exactly `HEARTBEAT_OK`. If something needs the user's attention, use the notify tool to alert them."
4. **Smart suppression**: If the agent's text response is exactly `HEARTBEAT_OK`, do nothing. Only when the agent has something to report does it use the `notify` tool (plan 068) to push to connectors.
5. **Keep the JSON heartbeat file** for daemon health monitoring (pid, memory, timestamp) — write this every cycle regardless of agent output.

### 5. Configurable interval
Replace the hardcoded `*/5 * * * *` cron with a dynamic schedule: `*/<intervalMinutes> * * * *`. Default 30 minutes. The system health JSON file still writes every cycle.

### 6. tRPC procedures
Add:
- `heartbeat.configure` — update interval, enable/disable
- `heartbeat.trigger` — manually trigger a heartbeat check (useful for testing)
- `heartbeat.status` — last run time, last result (OK or summary), main session info
- `mainSession.info` — return main session ID and metadata (useful for debugging)

### 7. Update bundled SA skill
Document the main session and heartbeat system in `src/engine/skills/bundled/sa/SKILL.md`.

## Files to change
- `src/shared/types.ts` (modify — add "engine" to ConnectorType, update Session type to use structured IDs)
- `src/engine/sessions.ts` (modify — refactor to `getOrCreate(sessionId, connectorType)`, remove UUID generation, add `getSessionType()` helper)
- `src/engine/config/types.ts` (modify — add HeartbeatConfig)
- `src/engine/config/defaults.ts` (modify — default heartbeat config)
- `src/engine/runtime.ts` (modify — create main session at startup, init heartbeat, create HEARTBEAT.md)
- `src/engine/scheduler.ts` (modify — overhaul createHeartbeatTask, configurable interval)
- `src/engine/procedures.ts` (modify — add heartbeat.* and mainSession.info procedures, export mainSessionId)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — document main session + heartbeat)
- `tests/heartbeat.test.ts` (create — test main session creation, configurable interval, suppress logic, checklist loading)

## Verification
- Run: `bun test tests/heartbeat.test.ts`
- Expected: Tests pass for: main session creation, structured ID convention (`prefix:id` format), `create`/`getLatest`/`listByPrefix` APIs, suppress token detection, interval configuration, checklist loading, task registration
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Run: `bun test tests/sessions.test.ts`
- Expected: Existing session tests updated to use structured IDs, `create`/`getLatest`/`listByPrefix` tested, `/new` creates fresh session under same prefix
- Manual: Set interval to 1 minute, edit HEARTBEAT.md with a check item, verify agent runs the check, suppresses on HEARTBEAT_OK, and notifies on actionable items
- Edge cases: HEARTBEAT.md missing (create default); empty checklist (always HEARTBEAT_OK); agent response is HEARTBEAT_OK within longer text (should NOT suppress — must be exact match); heartbeat disabled in config (skip); `getLatest("main")` returns the main session; `getType("cron:daily-report:x7y8")` returns `"cron"`; `create("main", "engine")` generates a unique suffix; `/new` under same prefix creates a new session without destroying the old one

## Progress
- Added "engine" to ConnectorType, HeartbeatConfig to RuntimeConfig, DEFAULT_HEARTBEAT and DEFAULT_HEARTBEAT_MD defaults
- Refactored SessionManager: structured prefix:id IDs, create(prefix, connectorType), getLatest(prefix), listByPrefix(prefix), getPrefix(), getType()
- Updated all session consumers: procedures (session.create accepts prefix), server.ts webhook handler, TUI/Telegram/Discord connectors
- Overhauled heartbeat: agent-based with HEARTBEAT.md checklist, smart suppress on exact HEARTBEAT_OK match, configurable interval, health JSON always written
- Created main session at engine startup in runtime.ts, exposed mainSessionId on EngineRuntime
- Added heartbeat.status/configure/trigger and mainSession.info tRPC procedures
- Updated bundled SA skill with session and heartbeat documentation
- Created tests/heartbeat.test.ts (15 tests) and rewrote tests/sessions.test.ts (27 tests)
- Modified: shared/types.ts, config/types.ts, config/defaults.ts, sessions.ts, runtime.ts, scheduler.ts, procedures.ts, server.ts, App.tsx, telegram/transport.ts, discord/transport.ts, SKILL.md
- Verification: all tests pass (349 pass, 1 skip), typecheck clean, lint clean
