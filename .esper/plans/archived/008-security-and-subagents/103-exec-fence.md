---
id: 103
title: Exec working directory fence
status: done
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
pr: https://github.com/sichengchen/sa/pull/29
---
# Exec working directory fence

## Context

Approved exec commands can read/write any user-accessible file. The exec tool (`src/engine/tools/exec.ts`) sets `cwd` to the user-supplied `workdir` parameter (or defaults to the system), but there's no restriction on what paths commands can access.

Exploration 011 proposes a configurable working directory fence — application-level path guards as the primary boundary, with optional OS sandbox as defense-in-depth (separate plan 107).

## Approach

### 1. Fence config

Add to `runtime.security` config:

```typescript
exec?: {
  fence?: string[];        // allowed working directories (default: ["~/projects", "/tmp"])
  alwaysDeny?: string[];   // always blocked paths (default: ["~/.sa", "~/.ssh", "~/.gnupg", "~/.aws", "~/.config/gcloud"])
}
```

### 2. Path validation module (`src/engine/tools/exec-fence.ts`)

```typescript
export function validateExecPaths(
  command: string,
  workdir: string,
  config: ExecFenceConfig,
  overrides?: Set<string>,   // from inline escalation (plan 102)
): { ok: true } | SecurityBlock;
```

Validation steps:
1. Check `workdir` is within `fence` directories (resolve `~` to home, normalize paths)
2. Scan command for absolute paths — if any path is in `alwaysDeny`, block
3. Scan command for absolute paths outside `fence` — block unless in session overrides
4. `~/.sa` is **always** denied, even if overridden (hard deny — requires explicit "confirm" via escalation)

Path extraction from commands: regex for `/path/to/thing` patterns. Not foolproof (can't parse all shell syntax) but catches the common case of LLM-generated commands which use explicit paths.

### 3. Integration with exec tool

In `exec.ts`, before spawning the process:
1. Call `validateExecPaths(command, workdir, fenceConfig, sessionOverrides)`
2. If blocked, return `{ content: "Blocked by exec fence: <detail>", isError: true, blocked_by: "exec_fence" }` for escalation integration
3. If allowed, proceed with existing execution

### 4. Default fence

Default `fence`: `["~/projects", "/tmp"]` — reasonable for a developer's personal assistant. The user can expand via config.

Default `alwaysDeny`: `["~/.sa", "~/.ssh", "~/.gnupg", "~/.aws", "~/.config/gcloud", "~/.config/1password"]` — credential directories.

### 5. Tests

- Unit tests for path validation: paths inside fence pass, outside fence block, alwaysDeny always blocks
- Unit test: command with absolute path outside fence is caught
- Unit test: session overrides allow previously blocked path
- Unit test: `~/.sa` cannot be overridden by session overrides
- Unit test: `~` expansion works correctly

## Files to change

- `src/engine/tools/exec-fence.ts` (create — path validation module)
- `src/engine/tools/exec-fence.test.ts` (create — unit tests)
- `src/engine/tools/exec.ts` (modify — integrate fence validation before exec)
- `src/engine/config/types.ts` (modify — add exec fence config)
- `src/engine/config/defaults.ts` (modify — add fence defaults)

## Verification

- Run: `bun test src/engine/tools/exec-fence.test.ts`
- Expected: All path validation tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Edge cases: Symlinks pointing outside fence (resolve before checking), relative paths (`../../../etc/passwd`), paths with spaces, commands using environment variables (`$HOME/.ssh`)

## Progress
- Implemented exec-fence.ts with validateExecPaths(), path expansion, extractAbsolutePaths, isPathWithinFence, isPathDenied, isPathWithinOverrides
- Created exec-fence.test.ts with 17 tests covering workdir validation, command path extraction, tilde expansion, session overrides, defaults
- Added exec fence config to runtime.security in types.ts
- Fixed override check to use prefix matching (isPathWithinOverrides helper)
- Modified: src/engine/tools/exec-fence.ts, src/engine/tools/exec-fence.test.ts, src/engine/config/types.ts
- Verification: all tests pass, typecheck clean, lint clean
