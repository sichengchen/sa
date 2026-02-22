---
id: 60
title: Security audit: exec sandboxing
status: done
type: feature
priority: 3
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# Security audit: exec sandboxing

## Context
The `exec` tool in `src/engine/tools/exec.ts` runs shell commands via `Bun.spawn(["sh", "-c", command])`. It has no sandboxing — commands run with the full privileges of the SA process (the user's account). The tool supports:
- `workdir` override (can cd anywhere)
- `env` overrides (can inject arbitrary env vars)
- `background` mode (long-running processes)
- `timeout` (default 30 minutes — very generous)

Background processes in `src/engine/tools/exec-background.ts` are tracked by handle but have no resource limits.

## Approach

### Step 1: Audit current execution model
Document what the exec tool can do:
- Run any command as the user
- Access the full filesystem
- Access the network
- Spawn child processes
- Modify environment variables
- Run for up to 30 minutes

### Step 2: Assess practical sandboxing options
For a single-user local tool, heavy sandboxing (containers, VMs) is overkill. Evaluate lightweight options:
1. **Working directory restriction**: optionally restrict `workdir` to a configurable set of allowed directories
2. **Environment sanitization**: strip sensitive env vars (API keys, tokens) from exec subprocesses by default
3. **Timeout reduction**: reduce default timeout from 30min to something more reasonable (e.g., 5min for foreground, 30min for explicit background)
4. **Command blocklist**: reject obviously destructive commands at the engine level (e.g., `rm -rf /`, `mkfs`, `dd if=/dev/zero`)
5. **Output limits**: cap stdout/stderr collection to prevent memory exhaustion

### Step 3: Implement practical fixes
Based on the audit, implement the low-cost, high-value fixes:

**Environment sanitization**: Before spawning, create a clean env that strips `SA_*` internal vars and any env vars that match known API key patterns (ending in `_KEY`, `_TOKEN`, `_SECRET`). The user can opt out via an `inheritEnv: true` flag.

**Timeout reduction**: Change default from 1800s to 300s for foreground commands. Keep 1800s for explicit `background: true`.

**Output capping**: Cap stdout+stderr collection at 1MB to prevent OOM from chatty commands.

### Step 4: Document security model
Add a comment block to `exec.ts` documenting the security model: what's protected, what's not, and what the user is responsible for.

## Files to change
- `src/engine/tools/exec.ts` (modify — env sanitization, timeout reduction, output capping)
- `src/engine/tools/exec-background.ts` (modify — audit background process limits)
- `src/engine/tools/exec.test.ts` (create — unit tests for env sanitization, output capping)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass
- Test: exec without `inheritEnv` strips sensitive env vars (ANTHROPIC_API_KEY, etc.)
- Test: exec with `inheritEnv: true` preserves all env vars
- Test: output capping truncates at 1MB
- Test: default timeout is 300s for foreground, 1800s for background
- Edge cases: command that produces exactly 1MB output, command that sets env vars internally

## Progress
- Implemented env sanitization: strips _KEY, _TOKEN, _SECRET, SA_*, ANTHROPIC_*, OPENAI_*, GOOGLE_AI_*, OPENROUTER_* from subprocess env
- User overrides can re-add stripped vars if explicitly set
- Reduced default foreground timeout from 1800s to 300s; background stays at 1800s
- Added output capping at 1MB for foreground (capOutput) and background (per-stream collection limit)
- Added security model documentation comment to exec.ts
- Note: did not implement `inheritEnv` flag — env overrides provide equivalent functionality and the default-safe approach is better
- Created 13 unit tests in exec.test.ts covering env sanitization patterns and output capping
- Modified: tools/exec.ts, tools/exec-background.ts, tools/exec.test.ts (new)
- Verification: typecheck passed, lint passed, 311 tests passed
