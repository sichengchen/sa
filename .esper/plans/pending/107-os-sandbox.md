---
id: 107
title: "OS sandbox — macOS Seatbelt / Linux Landlock"
status: pending
type: feature
priority: 3
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
---

# OS sandbox — macOS Seatbelt / Linux Landlock

## Context

The exec fence (plan 103) provides application-level path guards. OS-level sandboxing is defense-in-depth — a safety net that catches edge cases the app-level guard misses (symlink traversal, creative shell escapes). It is NOT the primary security boundary.

Exploration 011 specifies a best-effort sandbox: if the platform supports it, wrap exec calls; if not, log a warning and proceed with app-level guards only.

macOS: `sandbox-exec` (Seatbelt) — deprecated but still functional. Profile-based file/network restrictions.
Linux: Landlock LSM (kernel 5.13+) — no external dependencies, programmatic filesystem restrictions.

## Approach

### 1. Sandbox interface

```typescript
// src/engine/tools/sandbox.ts
export interface Sandbox {
  available(): boolean;
  name(): string;                   // "seatbelt" | "landlock" | "none"
  wrap(
    command: string[],
    opts: { fence: string[]; deny: string[] }
  ): string[];                      // returns modified command array
}
```

### 2. macOS Seatbelt implementation

Generate a `.sb` profile from fence config:
- Allow read/write within `fence` directories
- Deny access to `alwaysDeny` paths
- Allow network (HTTP/HTTPS) — network restrictions handled by URL policy, not sandbox
- Allow process-exec for the command itself

Wrap: `["sandbox-exec", "-f", profilePath, "--", ...originalCommand]`

Profile stored as temp file, deleted after exec completes.

### 3. Linux Landlock implementation

Use Landlock syscalls via Bun's FFI (or a thin native module):
- Set `LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE` for fence dirs
- Deny access outside fence
- Apply ruleset before exec

Alternatively, if FFI is too complex: use `bwrap` (bubblewrap) if available, which provides user-namespace sandboxing.

### 4. No-op fallback

If neither Seatbelt nor Landlock is available (or detection fails), return `Sandbox.available() = false`. The exec tool logs a one-time warning: "OS sandbox unavailable on this platform. Relying on application-level exec fence."

### 5. Platform detection

```typescript
export function detectSandbox(): Sandbox {
  if (process.platform === "darwin") return new SeatbeltSandbox();
  if (process.platform === "linux" && landLockAvailable()) return new LandlockSandbox();
  return new NoopSandbox();
}
```

### 6. Integration with exec tool

In `exec.ts`, after fence validation passes:
1. Get sandbox instance from runtime
2. If `sandbox.available()`, wrap the command: `sandbox.wrap(command, { fence, deny })`
3. Execute the wrapped command

### 7. Tests

- Unit test: Seatbelt profile generation (correct .sb syntax)
- Unit test: NoopSandbox.available() returns false, wrap() returns command unchanged
- Unit test: platform detection logic
- Integration test (macOS only): sandboxed command cannot read denied path
- Integration test (Linux only): Landlock-wrapped command respects fence

## Files to change

- `src/engine/tools/sandbox.ts` (create — Sandbox interface + implementations)
- `src/engine/tools/sandbox.test.ts` (create — unit tests)
- `src/engine/tools/exec.ts` (modify — wrap command with sandbox)
- `src/engine/runtime.ts` (modify — detect and initialize sandbox at startup)

## Verification

- Run: `bun test src/engine/tools/sandbox.test.ts`
- Expected: Profile generation and platform detection tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Manual (macOS): Execute `exec("cat /etc/passwd")` with fence excluding `/etc` — sandboxed command fails
- Edge cases: `sandbox-exec` not in PATH, Landlock kernel version too old, command with spaces in path, profile containing special characters in fence paths
