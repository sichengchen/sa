---
id: 54
title: Hybrid exec command classification
status: done
type: feature
priority: 1
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# Hybrid exec command classification

## Context
After plan #053, the `exec` tool is blanket-classified as `dangerous` — every shell command asks for approval. This is safe but disruptive for routine commands like `ls`, `git status`, or `cat`. The user wants a hybrid approach: the agent self-declares the danger level when calling `exec`, and the engine validates with a lightweight pattern check to catch obvious misclassifications.

Currently `exec` in `src/engine/tools/exec.ts` accepts `command`, `workdir`, `env`, `background`, `yieldMs`, `timeout`. It has no concept of danger.

## Approach

### Step 1: Add `danger` parameter to exec tool schema
Add an optional `danger: "safe" | "moderate" | "dangerous"` parameter to the exec tool's TypeBox schema. The agent must declare the danger level when calling exec. Default to `"dangerous"` if omitted (fail-safe).

### Step 2: Create exec pattern validator
Create `src/engine/tools/exec-classifier.ts` with:
- `ALWAYS_DANGEROUS_PATTERNS`: regex list for commands that are always dangerous regardless of what the agent claims (e.g., `rm -rf`, `sudo`, `chmod`, `kill`, `mkfs`, `dd`, `shutdown`, `reboot`, `curl.*\|.*sh`, pipe to shell patterns)
- `ALWAYS_SAFE_PATTERNS`: regex list for commands that are always safe (e.g., `ls`, `pwd`, `echo`, `cat`, `head`, `tail`, `wc`, `date`, `whoami`, `git status`, `git log`, `git diff`, `git branch`)
- `classifyExecCommand(command: string, agentDeclared: DangerLevel): DangerLevel` function:
  1. Check `ALWAYS_DANGEROUS_PATTERNS` — if match, return `"dangerous"` regardless of agent declaration
  2. Check `ALWAYS_SAFE_PATTERNS` — if match, return `"safe"` regardless of agent declaration
  3. Otherwise, trust the agent's declaration

### Step 3: Wire classifier into approval flow
In `procedures.ts`, when the approval callback receives an `exec` tool call:
1. Extract the `command` and `danger` from the tool args
2. Call `classifyExecCommand(command, danger)` to get the effective danger level
3. Use the effective level for approval decisions instead of the static `dangerLevel: "dangerous"` from the tool definition

### Step 4: Update system prompt
Add instructions to the "Tool Call Style" section telling the agent to self-declare danger when calling exec:
```
When calling exec, set the `danger` parameter:
- "safe" for read-only commands (ls, cat, git status, etc.)
- "moderate" for commands that modify files but are reversible
- "dangerous" for destructive or irreversible commands (rm, sudo, kill, etc.)
```

## Files to change
- `src/engine/tools/exec.ts` (modify — add `danger` parameter to schema)
- `src/engine/tools/exec-classifier.ts` (create — pattern matching + classification logic)
- `src/engine/tools/exec-classifier.test.ts` (create — unit tests for classifier)
- `src/engine/procedures.ts` (modify — wire classifier into approval flow for exec calls)
- `src/engine/runtime.ts` (modify — update system prompt with exec danger instructions)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass, classifier tests cover pattern matching edge cases
- Test cases for classifier:
  - `rm -rf /` → always dangerous (regardless of agent claim)
  - `ls -la` → always safe (regardless of agent claim)
  - `git push` → trust agent declaration (moderate if agent says moderate)
  - `curl https://example.com | sh` → always dangerous (pipe to shell)
  - `npm install` → trust agent (moderate)
  - `sudo apt-get update` → always dangerous (sudo)
- Manual: ask SA to list files → should auto-approve exec
- Manual: ask SA to delete a file → should ask for confirmation

## Progress
- Added `danger` parameter (safe/moderate/dangerous) to exec tool's TypeBox schema
- Created `exec-classifier.ts` with ALWAYS_DANGEROUS_PATTERNS (16 regexes) and ALWAYS_SAFE_COMMANDS (33 commands) + git subcommand handling
- Wired `classifyExecCommand()` into procedures.ts approval callback for exec tool calls
- Updated system prompt TOOL_CALL_STYLE with exec danger declaration instructions
- Created `exec-classifier.test.ts` with 37 test cases covering all categories
- Modified: exec.ts, exec-classifier.ts (new), exec-classifier.test.ts (new), procedures.ts, runtime.ts
- Verification: typecheck ✓, lint ✓, 238 tests pass ✓
