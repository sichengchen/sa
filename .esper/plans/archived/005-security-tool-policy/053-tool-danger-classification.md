---
id: 53
title: 3-tier tool danger classification system
status: done
type: feature
priority: 1
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# 3-tier tool danger classification system

## Context
The current tool system uses a binary `SAFE_TOOLS` Set in `src/engine/procedures.ts` to decide which tools skip approval UI. All other tools are treated equally — no distinction between `write` (modifies a file) and `exec` (runs arbitrary shell commands). The `ToolImpl` interface in `src/engine/agent/types.ts` has no danger metadata.

TUI currently auto-approves everything (`mode: "never"`), and IM connectors ask for all non-safe tools. There's no way for users to customize this behavior.

## Approach

### Step 1: Define the danger level type and add to ToolImpl
Add `dangerLevel: "safe" | "moderate" | "dangerous"` to the `ToolImpl` interface in `src/engine/agent/types.ts`. Make it required so every tool must declare its level.

Default assignments:
- **safe**: `read`, `read_skill`, `remember`, `reaction`, `clawhub_search`, `web_search`, `web_fetch`, `set_env_variable`, `set_env_secret`, `exec_status`
- **moderate**: `write`, `edit`, `clawhub_install`, `clawhub_update`
- **dangerous**: `exec`, `exec_kill`

### Step 2: Replace SAFE_TOOLS with registry-based classification
Remove the hard-coded `SAFE_TOOLS` Set from `procedures.ts`. Instead, have the `ToolRegistry` expose a `getDangerLevel(toolName)` method. The approval logic in `getSessionAgent()` changes from:
```
if (SAFE_TOOLS.has(toolName)) return true;
```
to:
```
const level = registry.getDangerLevel(toolName);
if (level === "safe") return true;
if (level === "moderate" && mode !== "always") return true;
```

### Step 3: Update approval flow for 3 tiers
Modify the approval callback in `procedures.ts`:
- **safe**: always auto-approve, never emit `tool_approval_request`
- **moderate**: auto-approve on TUI and webhook; ask on IM connectors (current "ask" behavior)
- **dangerous**: always ask on ALL connectors including TUI (new behavior)

For TUI, this means the `tool_approval_request` event will now sometimes arrive. The TUI `App.tsx` must handle it — show a confirmation prompt instead of blindly approving.

### Step 4: Add TUI approval dialog
Create a minimal approval component in `src/connectors/tui/` that shows the tool name, args summary, and [Y/n] prompt. Wire it into `App.tsx`'s event handler for `tool_approval_request`.

### Step 5: Update event filtering in procedures.ts
The `chat.stream` subscription currently checks `SAFE_TOOLS.has(event.name)` in multiple places to decide whether to suppress `tool_start`/`tool_approval_request`. Replace all these checks with `registry.getDangerLevel()` lookups.

## Files to change
- `src/engine/agent/types.ts` (modify — add `dangerLevel` to `ToolImpl`)
- `src/engine/agent/registry.ts` (modify — add `getDangerLevel()` method)
- `src/engine/tools/read.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/write.ts` (modify — add `dangerLevel: "moderate"`)
- `src/engine/tools/edit.ts` (modify — add `dangerLevel: "moderate"`)
- `src/engine/tools/exec.ts` (modify — add `dangerLevel: "dangerous"`)
- `src/engine/tools/exec-background.ts` (modify — add `dangerLevel` to exec_status/exec_kill)
- `src/engine/tools/web-fetch.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/web-search.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/reaction.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/clawhub-search.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/clawhub-install.ts` (modify — add `dangerLevel: "moderate"`)
- `src/engine/tools/clawhub-update.ts` (modify — add `dangerLevel: "moderate"`)
- `src/engine/tools/remember.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/read-skill.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/tools/set-api-key.ts` (modify — add `dangerLevel: "safe"`)
- `src/engine/procedures.ts` (modify — replace SAFE_TOOLS, update approval logic)
- `src/connectors/tui/App.tsx` (modify — handle tool_approval_request with dialog)
- `src/connectors/tui/ToolApproval.tsx` (create — approval dialog component)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass, no type errors from new required `dangerLevel` field
- Edge cases: dynamic tools (remember, set_env_*, read_skill, clawhub_install/update) must also set `dangerLevel`
- Manual: send a message that triggers `exec` from TUI — should now show approval dialog
- Manual: send a message that triggers `write` from Telegram — should still ask
- Manual: send a message that triggers `read` from Telegram — should auto-approve silently

## Progress
- Added `DangerLevel` type and `dangerLevel` required field to `ToolImpl` interface
- Added `getDangerLevel()` method to `ToolRegistry` (defaults to "dangerous" for unknown tools)
- Tagged all 17 tool implementations with their danger levels (safe/moderate/dangerous)
- Replaced `SAFE_TOOLS` Set with danger-level lookup map in `procedures.ts`
- Rewrote approval callback: safe=auto-approve, moderate=approve unless "always" mode, dangerous=always ask
- Updated all `SAFE_TOOLS.has()` references in stream event filtering to `getDangerLevel()`
- Created `ToolApproval.tsx` component with [y/n/a] prompt for TUI
- Wired approval dialog into `App.tsx` — replaces input when approval is pending
- Modified: types.ts, registry.ts, all 15 tool files, procedures.ts, App.tsx, ToolApproval.tsx (new)
- Verification: typecheck ✓, lint ✓, 201 tests pass ✓
