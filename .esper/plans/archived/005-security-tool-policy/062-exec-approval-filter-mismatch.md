---
id: 62
title: fix: exec tool shows phantom approval dialogs for safe commands
status: done
type: fix
priority: 2
phase: 005-security-tool-policy
branch: fix/exec-approval-filter-mismatch
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/11
---
# fix: exec tool shows phantom approval dialogs for safe commands

## Context

The `onToolApproval` callback in `procedures.ts:89-140` and the `filterAgentEvents` generator in `procedures.ts:147-214` disagree on the danger level of `exec` commands. The callback uses the **hybrid exec classifier** (`classifyExecCommand`) to determine the real danger level — e.g. `ls` → safe, `rm -rf /` → dangerous — but `filterAgentEvents` only checks the **base** danger level via `getDangerLevel("exec")` which always returns `"dangerous"`.

This causes a two-layer mismatch:

1. **Agent** yields `tool_approval_request` for every tool call (by design — `agent.ts:103-109`).
2. **Callback** auto-approves safe exec commands immediately (returns `true`).
3. **Filter** still emits the `tool_approval_request` to the connector because it sees exec as `"dangerous"`.
4. **Connector** shows an approval dialog (TUI) or inline keyboard (Telegram), but the tool has already been auto-approved and executed by the time the user sees it.

Result: phantom approval prompts appear on both TUI and IM for commands like `ls`, `cat`, `git status`, `pwd`, etc. The user presses "approve" but the `pendingApprovals` resolver is already gone, returning `{ acknowledged: false }`.

Since `exec` is the most frequently used tool, this makes it look like "all tools ask for permission."

## Approach

1. **`procedures.ts` — `filterAgentEvents`**: In the `tool_approval_request` case, apply the same exec hybrid classification that the callback uses. Extract `event.args.command` and `event.args.danger`, call `classifyExecCommand()`, and use the classified level instead of the base level.

2. **`procedures.ts` — `filterAgentEvents`**: Also apply exec classification to `tool_start` events so that safe exec commands are reported consistently with their classified danger level (avoids showing "dangerous tool starting" for `ls`).

3. **Extract a shared helper**: Factor the "resolve effective danger level" logic into a small helper function used by both the callback and the filter, to avoid duplication and future drift:
   ```ts
   function getEffectiveDangerLevel(toolName: string, args: Record<string, unknown>): DangerLevel {
     let level = getDangerLevel(toolName);
     if (toolName === "exec" && typeof args.command === "string") {
       const agentDeclared = (args.danger as DangerLevel | undefined) ?? "dangerous";
       level = classifyExecCommand(args.command, agentDeclared);
     }
     return level;
   }
   ```

## Files to change

- `src/engine/procedures.ts` (modify — add `getEffectiveDangerLevel` helper, use it in `getSessionAgent` callback + `filterAgentEvents` for `tool_approval_request` and `tool_start` cases)

## Verification

- Run: `bun run typecheck && bun run lint && bun test`
- Manual: start the engine, send a message that triggers safe exec commands (e.g. "what's in my home directory?") — no approval dialog should appear for `ls`, `pwd`, `cat`, `git status`
- Manual: send a message that triggers a dangerous exec command (e.g. "delete tmp files") — approval dialog SHOULD appear
- Regression check: moderate tools (`write`, `edit`) should still auto-approve on TUI (mode "never") and not prompt on Telegram (mode "ask")

## Progress
- Milestones: 1 commit
- Modified: src/engine/procedures.ts
- Verification: not yet run — run /esper:finish to verify and archive
