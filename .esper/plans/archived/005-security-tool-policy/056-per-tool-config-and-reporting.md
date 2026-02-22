---
id: 56
title: Per-tool config and reporting overhaul
status: done
type: feature
priority: 2
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# Per-tool config and reporting overhaul

## Context
Tool reporting is currently hard-coded in `src/engine/procedures.ts`:
- TUI shows all `tool_start` and `tool_end` events
- IM connectors show `tool_start` (as a brief summary) for non-safe tools, suppress `tool_end`
- No way for users to configure verbosity or override danger levels per tool

The user wants: silent by default, report only for dangerous tools, errors, and long-running tasks.

## Approach

### Step 1: Define toolPolicy config schema
Add to `RuntimeConfig` in `src/engine/config/types.ts`:
```typescript
interface ToolPolicyConfig {
  /** Per-connector reporting verbosity */
  verbosity?: Partial<Record<ConnectorType, "silent" | "minimal" | "verbose">>;
  /** Per-tool overrides (danger level and/or reporting) */
  overrides?: Record<string, {
    dangerLevel?: "safe" | "moderate" | "dangerous";
    report?: "always" | "never" | "on_error";
  }>;
}
```

Defaults:
- `verbosity`: `{ tui: "minimal", telegram: "silent", discord: "silent", webhook: "silent" }`
- `overrides`: `{}` (empty — use tool's built-in danger level)

### Step 2: Create ToolPolicyManager
Create `src/engine/tools/policy.ts` that:
- Loads the policy from config
- Resolves effective danger level for a tool (override > built-in)
- Decides whether to emit a tool event based on verbosity + danger level + error state:
  - **silent**: only emit for errors, dangerous tool approvals, and long-running (>10s) tasks
  - **minimal**: emit `tool_start` for moderate+dangerous, always emit errors
  - **verbose**: emit everything (current TUI behavior)

### Step 3: Refactor event filtering in procedures.ts
Replace the inline `isIM && SAFE_TOOLS.has(event.name)` checks with calls to `ToolPolicyManager.shouldEmit(connectorType, event)`. This centralizes all filtering logic.

The duplicated event filtering in `chat.stream` and `transcribeAndSend` should be extracted into a shared generator transform function.

### Step 4: Update config defaults
Add `toolPolicy` to `DEFAULT_CONFIG` in `src/engine/config/defaults.ts`.

### Step 5: Detect long-running tools
Track tool execution start time. If a tool takes >10 seconds, emit a `tool_start` event even in silent mode so the user knows something is running. This is particularly relevant for `exec` with `yieldMs`.

## Files to change
- `src/engine/config/types.ts` (modify — add `ToolPolicyConfig` and `toolPolicy` to `RuntimeConfig`)
- `src/engine/config/defaults.ts` (modify — add default policy)
- `src/engine/tools/policy.ts` (create — ToolPolicyManager)
- `src/engine/tools/policy.test.ts` (create — unit tests)
- `src/engine/procedures.ts` (modify — replace inline filtering with policy manager)
- `src/engine/runtime.ts` (modify — initialize policy manager, pass to procedures)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: policy tests cover all verbosity × danger level × error combinations
- Manual: with default config (TUI minimal), routine `read` calls should be silent, `exec` should show start
- Manual: set Telegram verbosity to "verbose", verify all tool events appear
- Manual: override `write` danger to "dangerous" in config, verify it now asks for approval
- Edge cases: unknown tool names in overrides should be silently ignored (forward-compatible)

## Progress
- Implemented ToolPolicyConfig schema (ToolVerbosity, ToolOverride, ToolPolicyConfig types) in config/types.ts
- Created ToolPolicyManager class in tools/policy.ts with shouldEmitToolStart, shouldEmitToolEnd, shouldEmitApproval methods
- Refactored procedures.ts: extracted duplicated event filtering from chat.stream and transcribeAndSend into shared filterAgentEvents generator, wired through ToolPolicyManager
- Added default toolPolicy to DEFAULT_CONFIG in defaults.ts
- Created 36 unit tests in policy.test.ts covering all verbosity × danger level × error × override combinations
- Note: runtime.ts already passes toolPolicy via config; ToolPolicyManager is instantiated directly in procedures.ts from config + builtin levels (no changes needed to runtime.ts)
- Modified: config/types.ts, config/defaults.ts, tools/policy.ts, tools/policy.test.ts, procedures.ts
- Verification: typecheck passed, lint passed, 290 tests passed
