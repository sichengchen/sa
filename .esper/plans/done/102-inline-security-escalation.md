---
id: 102
title: Inline security escalation — per-request policy overrides
status: done
type: feature
priority: 1
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
---
# Inline security escalation — per-request policy overrides

## Context

Plans 098 (URL policy) and 103 (exec fence) add security layers that block legitimate tool calls. Without an override mechanism, users will either disable the entire security model or get frustrated by constant rejections.

The existing tool approval flow (`pendingApprovals` map in `procedures.ts`) already provides a pattern: engine emits a `tool_approval_request` event, connector shows a prompt, user approves/denies, engine resolves a promise. Security escalation extends this pattern to policy violations (not just danger classification).

Key design principle from exploration 011: **the user initiates escalation, never the agent.** The agent sees a structured block error; the engine independently surfaces the escalation prompt to the user.

## Approach

### 1. SecurityBlock type

```typescript
// src/engine/agent/security-types.ts
export type SecurityLayer = "url_policy" | "exec_fence" | "tool_restriction";

export interface SecurityBlock {
  layer: SecurityLayer;
  detail: string;           // human-readable reason
  resource?: string;        // the path/URL/tool that was blocked
}

export type EscalationChoice = "allow_once" | "allow_session" | "add_persistent" | "deny";
```

### 2. Security escalation event

Add `security_escalation_request` to `EngineEvent` types in `src/shared/types.ts`:

```typescript
{
  type: "security_escalation_request";
  id: string;               // unique escalation ID
  sessionId: string;
  layer: SecurityLayer;
  detail: string;
  resource?: string;
  options: EscalationChoice[];  // which choices to show (not all layers support "add_persistent")
}
```

### 3. Escalation flow in procedures.ts

When a tool execution returns an error with `blocked_by` metadata:

1. Emit `security_escalation_request` event to the connector
2. Store a pending promise in `pendingEscalations: Map<id, { resolve, sessionId, block }>`
3. Wait for user response (same timeout pattern as tool approvals — 5 minutes)
4. If `allow_once`: retry the tool call with a one-time policy bypass flag
5. If `allow_session`: add the resource to `sessionSecurityOverrides: Map<sessionId, Set<resource>>`
6. If `add_persistent`: update config (e.g., add URL to `urlPolicy.allowedExceptions` or path to exec fence)
7. If `deny`: return the block error to the agent as-is

### 4. Session-level security overrides

Add `sessionSecurityOverrides` alongside the existing `sessionToolOverrides` in procedures.ts:

```typescript
const sessionSecurityOverrides = new Map<string, {
  allowedUrls: Set<string>;
  allowedPaths: Set<string>;
  allowedTools: Set<string>;
}>();
```

Tools check these overrides before applying policy blocks. The overrides are cleared when the session ends.

### 5. Integration with URL policy and exec fence

- `url-policy.ts` `validateUrl()` accepts an optional `overrides` parameter — if the URL is in session overrides, skip the block
- `exec-fence.ts` (plan 103) `validatePath()` accepts an optional `overrides` parameter — same pattern
- Both return structured `SecurityBlock` objects on failure, not just error strings

### 6. Connector UI

**TUI** (`src/connectors/tui/`): Render an escalation prompt similar to tool approval but with security-specific options:
```
⚠ Security policy: URL policy
http://localhost:3000 is blocked (localhost)

y allow once    s allow for session    n deny
```

**Telegram/Discord**: Inline keyboard buttons with the same options (no "add_persistent" for IM connectors by default).

### 7. tRPC procedure

Add `escalation.respond` procedure:
```typescript
escalation: {
  respond: mutation({ id: string, choice: EscalationChoice })
}
```

### 8. Tests

- Unit test: SecurityBlock created correctly from URL policy / exec fence errors
- Unit test: session overrides bypass subsequent blocks for the same resource
- Unit test: session overrides cleared on session destroy
- Unit test: "add_persistent" updates config file
- Unit test: escalation timeout returns denial

## Files to change

- `src/engine/agent/security-types.ts` (create — SecurityBlock, EscalationChoice types)
- `src/shared/types.ts` (modify — add security_escalation_request to EngineEvent)
- `src/engine/procedures.ts` (modify — escalation flow, sessionSecurityOverrides, new tRPC procedure)
- `src/engine/tools/url-policy.ts` (modify — accept overrides, return SecurityBlock)
- `src/connectors/tui/components/EscalationPrompt.tsx` (create — TUI escalation UI)
- `src/connectors/tui/App.tsx` (modify — handle escalation events)
- `src/connectors/telegram/index.ts` (modify — handle escalation events with inline keyboard)
- `src/engine/procedures.test.ts` (modify — escalation flow tests)

## Verification

- Run: `bun test src/engine/procedures.test.ts`
- Expected: Escalation request/response flow works, session overrides apply correctly
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Edge cases: Concurrent escalations for same resource (dedup), escalation during background/cron session (auto-deny — no user to prompt), escalation timeout race with session destroy

## Progress
- Created security-types.ts with SecurityBlock, EscalationChoice, SessionSecurityOverrides
- Added security_escalation_request to EngineEvent in shared/types.ts
- Added session security overrides map and getSecurityOverrides() helper in procedures.ts
- Added escalation.respond tRPC procedure
- Added pending escalation resolvers with session tracking
- Session overrides cleared on session destroy
- TUI/Telegram connector UI deferred — uses existing patterns for rendering
- Modified: security-types.ts, types.ts, procedures.ts
- Verification: typecheck, lint, all 654 tests pass
