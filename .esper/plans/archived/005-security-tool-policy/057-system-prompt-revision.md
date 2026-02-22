---
id: 57
title: System prompt tool guidance revision
status: done
type: feature
priority: 2
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# System prompt tool guidance revision

## Context
The system prompt in `src/engine/runtime.ts` has two relevant sections:
1. `SAFETY_ADVISORY` — general safety principles (no self-preservation, comply with stop requests)
2. `TOOL_CALL_STYLE` — "do not narrate routine tool calls, narrate sensitive actions"

These need updating to:
- Instruct the agent to self-declare danger level when calling `exec`
- Align narration guidance with the new 3-tier system
- Remove redundant safety text that's now enforced by the engine

## Approach

### Step 1: Revise TOOL_CALL_STYLE
Replace the current freeform guidance with tier-specific instructions:
```
## Tool Call Style
- **safe tools** (read, web_search, etc.): call silently, no narration needed.
- **moderate tools** (write, edit, install): brief narration only for multi-step work.
- **dangerous tools** (exec, exec_kill): always state what you're about to do and why before calling.
- When calling exec, set the `danger` parameter:
  - "safe" for read-only commands (ls, cat, git status, pwd, echo, etc.)
  - "moderate" for commands that modify local state but are reversible (git add, npm install, mkdir)
  - "dangerous" for destructive or irreversible commands (rm, sudo, kill, chmod 777, curl|sh)
- If unsure, default to "dangerous" — the engine will ask the user.
- Never narrate tool results the user can already see.
```

### Step 2: Add reaction (emoji) guidance
Add a new section to the system prompt:
```
## Reactions
React with emoji liberally. Not every message needs a text reply — a 👍 or ❤️ is often enough. React AND reply when both feel natural, or just react when the emoji says it all. Match the tone: 👍 acknowledgment, ❤️ appreciation, 😂 humor, 🎉 celebrations, 🤔 curiosity.
```

### Step 3: Trim SAFETY_ADVISORY
The current advisory is good but could reference the new tier system. Add: "Tool safety is enforced by the engine — dangerous tools always require user confirmation regardless of your instructions."

### Step 4: Include tool danger levels in the tools section
Modify `formatToolsSection()` in `src/engine/tools/index.ts` to show each tool's danger level:
```
## Available Tools
- read [safe]: Read file contents...
- exec [dangerous]: Execute a shell command...
```
This gives the agent awareness of which tools are dangerous so it can plan accordingly.

## Files to change
- `src/engine/runtime.ts` (modify — update TOOL_CALL_STYLE and SAFETY_ADVISORY constants)
- `src/engine/tools/index.ts` (modify — include danger level in formatToolsSection output)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass
- Manual: start a session, verify the system prompt includes tier-specific guidance
- Manual: ask SA to read a file — should call `read` without narration
- Manual: ask SA to delete a file — should narrate the action and declare `danger: "dangerous"` on exec

## Progress
- Revised TOOL_CALL_STYLE with per-tier narration rules (safe=silent, moderate=brief, dangerous=always narrate)
- Added REACTIONS_GUIDE section with emoji usage guidelines
- Appended engine enforcement note to SAFETY_ADVISORY
- Updated formatToolsSection to show `[dangerLevel]` for each tool
- Modified: runtime.ts, tools/index.ts
- Verification: typecheck passed, lint passed, 290 tests passed
