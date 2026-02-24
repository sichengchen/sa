---
id: 104
title: Audit log — append-only structured event log
status: done
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
---
# Audit log — append-only structured event log

## Context

SA has no visibility into what the agent has done. Tool calls, approvals, denials, auth events, and security escalations are not logged. Without an audit trail, users cannot detect compromise, review agent behavior, or debug security issues.

Exploration 011 specifies an append-only NDJSON log with rotation, readable via a CLI command. The audit log is a "hard" security layer — it cannot be disabled, even in unrestricted mode.

## Approach

### 1. AuditLogger module (`src/engine/audit.ts`)

```typescript
interface AuditEntry {
  ts: string;                // ISO-8601
  session: string;           // session ID (truncated to 12 chars for readability)
  connector: string;         // "tui" | "telegram" | "discord" | "webhook" | "cron"
  event: AuditEvent;
  tool?: string;
  danger?: DangerLevel;
  command?: string;          // for exec: full command (security-critical, logged verbatim)
  url?: string;              // for web_fetch: the requested URL
  summary?: string;          // truncated result summary (max 200 chars)
  escalation?: {
    layer: string;
    choice: string;
    resource?: string;
  };
}

type AuditEvent =
  | "tool_call"              // tool was called
  | "tool_result"            // tool returned (with summary)
  | "tool_approval"          // user approved a tool call
  | "tool_denial"            // user denied a tool call
  | "security_block"         // security policy blocked a call
  | "security_escalation"    // user responded to escalation
  | "auth_success"           // successful auth (pairing, reconnect)
  | "auth_failure"           // failed auth attempt
  | "mode_change"            // security mode changed
  | "session_create"         // new session created
  | "session_destroy"        // session destroyed
  | "error";                 // error event

class AuditLogger {
  constructor(logDir: string);  // default: ~/.sa/

  log(entry: Omit<AuditEntry, "ts">): void;  // appends with timestamp
  close(): void;  // flush and close file handle
}
```

### 2. Storage

- File: `~/.sa/audit.log` (NDJSON — one JSON object per line)
- Rotation: When file exceeds 10MB, rotate to `audit.log.1` → `audit.log.2` (keep 3 generations)
- Append-only: no truncation, no editing. The logger opens the file in append mode.
- Permissions: `0o600` (owner read/write only)

### 3. Integration points

Instrument these locations to emit audit entries:
- `procedures.ts`: tool execution (tool_call, tool_result), approval/denial flow, escalation
- `auth.ts`: auth success/failure
- `sessions.ts`: session create/destroy
- `server.ts`: webhook auth events

Create a singleton `AuditLogger` in `EngineRuntime` and pass it to subsystems.

### 4. CLI command: `sa audit`

Add `sa audit` subcommand to `src/cli/index.ts`:
- `sa audit` — tail last 20 entries
- `sa audit --tail N` — tail last N entries
- `sa audit --tool exec` — filter by tool name
- `sa audit --event auth_failure` — filter by event type
- `sa audit --since 2026-02-01` — filter by date
- `sa audit --json` — raw NDJSON output (for piping)

Default output: human-readable table format with colored event types.

### 5. Tests

- Unit test: AuditLogger writes valid NDJSON
- Unit test: log rotation at 10MB threshold
- Unit test: entries include all required fields
- Unit test: file permissions are 0o600
- Unit test: CLI filtering works correctly

## Files to change

- `src/engine/audit.ts` (create — AuditLogger class)
- `src/engine/audit.test.ts` (create — unit tests)
- `src/engine/runtime.ts` (modify — create AuditLogger singleton, pass to subsystems)
- `src/engine/procedures.ts` (modify — emit audit entries for tool calls, approvals, escalations)
- `src/engine/auth.ts` (modify — emit audit entries for auth events)
- `src/engine/sessions.ts` (modify — emit audit entries for session lifecycle)
- `src/engine/server.ts` (modify — emit audit entries for webhook auth)
- `src/cli/index.ts` (modify — add `sa audit` subcommand)

## Verification

- Run: `bun test src/engine/audit.test.ts`
- Expected: All logger tests pass — write, rotation, permissions
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Manual: Start engine, perform tool calls, run `sa audit` — entries visible
- Edge cases: Concurrent writes (append is atomic on POSIX for small writes), rotation during active write, corrupt NDJSON line (skip on read, don't crash)

## Progress
- Created AuditLogger class with NDJSON append, rotation at 10MB, 0o600 permissions
- 13 unit tests covering write, rotation, permissions, truncation, rapid writes
- Wired AuditLogger into EngineRuntime as singleton
- Instrumented procedures.ts: tool_call, tool_result, tool_approval, tool_denial, security_escalation, session_create, session_destroy, auth_success, auth_failure
- Instrumented server.ts: webhook auth_failure
- Created `sa audit` CLI with --tail, --tool, --event, --since, --json flags
- Auth events logged through procedures.ts pair endpoint (not in auth.ts directly) to keep AuditLogger decoupled
- Session events logged through procedures.ts create/destroy endpoints (not sessions.ts) for same reason
- Modified: audit.ts, audit.test.ts, runtime.ts, procedures.ts, server.ts, cli/audit.ts, cli/index.ts
- Verification: 684 tests pass, typecheck clean, lint clean
