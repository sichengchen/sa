---
id: 105
title: "Session security modes — default/trusted/unrestricted"
status: pending
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
---

# Session security modes — default/trusted/unrestricted

## Context

Plans 098 (URL policy), 103 (exec fence), and 102 (inline escalation) add security layers with per-request override capability. For tasks where the user knows upfront they'll need elevated permissions (e.g., system administration, deployment), repeated per-request prompts are annoying. Session modes provide broad escalation.

Exploration 011 defines three modes with different security postures. Hard layers (content framing, output redaction, audit log, env sanitization) remain active in all modes.

## Approach

### 1. Security mode types

```typescript
type SecurityMode = "default" | "trusted" | "unrestricted";

interface SecurityModeState {
  mode: SecurityMode;
  activatedAt: number;       // timestamp
  expiresAt: number;         // auto-revert timestamp
  activatedBy: string;       // session ID that activated it
}
```

Mode effects:

| Layer | default | trusted | unrestricted |
|-------|---------|---------|-------------|
| Approval gate | Full | Danger-only | Off |
| URL policy | Full | Relaxed (localhost allowed, still block metadata/SA ports) | Off |
| Exec fence | Full | Wide (~, deny only ~/.sa) | Off |
| Content framing | On | On | On |
| Audit | On | On | On |

### 2. Mode manager

Add `SecurityModeManager` to engine runtime:
- `getMode(sessionId): SecurityMode` — returns current mode (checks expiry, auto-reverts)
- `setMode(sessionId, mode): void` — requires user initiation (not callable by agent)
- `getRemainingTTL(sessionId): number` — seconds until auto-revert

### 3. Auto-revert

- `trusted`: auto-reverts after 60 minutes (configurable `runtime.security.modeTTL.trusted`)
- `unrestricted`: auto-reverts after 30 minutes (configurable `runtime.security.modeTTL.unrestricted`)
- On session end: always reverts to `default`
- Timer tracked per-session

### 4. User activation

**TUI**: `/mode trusted`, `/mode unrestricted`, `/mode default` commands. Processed locally in the TUI connector before sending to engine.

**IM connectors**: Same `/mode` commands via message text. `unrestricted` disabled by default for IM (`runtime.security.allowUnrestrictedFromIM: false`).

**Agent**: Cannot activate modes. Mode switching is a user command, not a tool.

### 5. Confirmation prompt

On mode switch, show:
```
Switching to TRUSTED mode
✓ Approval gate: only always-dangerous prompts
✓ URL policy: localhost allowed
✓ Exec fence: widened to ~, deny only ~/.sa
✓ Content framing: still active
✓ Audit log: still active
Auto-reverts to default after 60 minutes.
```

### 6. Visual indicators

**TUI status bar**: Show current mode + remaining time: `⚡ TRUSTED (47m)` or `⚠ UNRESTRICTED (12m)`. `DEFAULT` shown without decoration.

**IM**: Prepend mode indicator to first message after mode change.

### 7. System prompt integration

Include current mode in system prompt so agent knows its capabilities:
```
Current security mode: TRUSTED
- Exec fence: widened (deny only ~/.sa)
- URL policy: localhost allowed
- Approval: only always-dangerous patterns require approval
```

### 8. Config

```typescript
security?: {
  defaultMode?: SecurityMode;           // default: "default"
  modeTTL?: {
    trusted?: number;                   // seconds, default 3600
    unrestricted?: number;              // seconds, default 1800
  };
  allowUnrestrictedFromIM?: boolean;    // default: false
}
```

### 9. Audit integration

Log `mode_change` events: `{ event: "mode_change", from: "default", to: "trusted", ttl: 3600 }`.

### 10. Tests

- Unit test: mode auto-reverts after TTL
- Unit test: mode cleared on session destroy
- Unit test: unrestricted blocked from IM when config disabled
- Unit test: URL policy respects current mode
- Unit test: exec fence respects current mode
- Unit test: hard layers active in all modes

## Files to change

- `src/engine/security-mode.ts` (create — SecurityModeManager)
- `src/engine/security-mode.test.ts` (create — unit tests)
- `src/engine/runtime.ts` (modify — initialize SecurityModeManager)
- `src/engine/procedures.ts` (modify — check mode in approval flow, pass mode to tool execution)
- `src/engine/tools/url-policy.ts` (modify — relax rules in trusted/unrestricted mode)
- `src/engine/tools/exec-fence.ts` (modify — widen fence in trusted/unrestricted mode)
- `src/engine/tools/exec.ts` (modify — skip approval in unrestricted mode)
- `src/shared/types.ts` (modify — add mode_change event type)
- `src/connectors/tui/App.tsx` (modify — /mode command, status bar indicator)
- `src/connectors/telegram/index.ts` (modify — /mode command handling)
- `src/engine/config/types.ts` (modify — add mode config)
- `src/engine/config/defaults.ts` (modify — add mode defaults)

## Verification

- Run: `bun test src/engine/security-mode.test.ts`
- Expected: All mode lifecycle tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Manual: Start TUI, `/mode trusted`, verify relaxed URL policy and exec fence, wait for auto-revert
- Edge cases: Mode change during active tool execution (apply to next call, not current), concurrent mode changes from different sessions (per-session state)
