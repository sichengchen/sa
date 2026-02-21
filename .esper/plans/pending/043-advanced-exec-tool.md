---
id: 043
title: Advanced exec tool to replace bash
status: pending
type: feature
priority: 1
phase: phase-3
branch: feature/phase-3
created: 2026-02-21
---

# Advanced exec tool to replace bash

## Context
The current bash tool (`src/engine/tools/bash.ts`) is minimal: `command`, `cwd`, `timeout` (default 30s). It uses `Bun.spawn(["sh", "-c", command])` with pipe stdout/stderr. Phase 3 requires a richer exec tool with: workdir, env overrides, yieldMs (auto-background after delay), background mode, timeout (in seconds, default 1800), pty support for interactive CLIs.

## Approach

1. **Create `src/engine/tools/exec.ts`** — new tool implementation:
   - `command` (required): The shell command to execute
   - `workdir` (optional, defaults to cwd): Working directory
   - `env` (optional): Key/value overrides merged with `process.env`
   - `yieldMs` (optional, default 10000): After this many ms, auto-background and return a handle
   - `background` (optional, boolean): Start in background immediately, return handle
   - `timeout` (optional, default 1800): Kill on expiry (in seconds)
   - `pty` (optional, boolean): Run in a pseudo-terminal using `node-pty` (for TTY-only CLIs, coding agents, terminal UIs)

2. **Background execution model** — when `background: true` or yieldMs triggers:
   - Store the running process in a `Map<string, BackgroundProcess>` keyed by a generated handle ID
   - Return immediately with `{ handle: "<id>", status: "running" }`
   - Add companion tools: `exec_status(handle)` to check output/status, `exec_kill(handle)` to terminate

3. **PTY mode** — use `node-pty` (or Bun's built-in PTY if available) to allocate a pseudo-terminal:
   - Capture output including ANSI escape sequences
   - Support full interactive mode where connector supports it
   - Graceful fallback to pipe mode if node-pty is not available

4. **Replace bash in built-in tools** — update `src/engine/tools/index.ts` to export `execTool` instead of `bashTool`. Keep `bashTool` file for one release as deprecated alias pointing to exec.

5. **Update tool descriptions and prompt hints** — update `src/engine/agent/prompt.ts` tool summary section.

## Files to change
- `src/engine/tools/exec.ts` (create — main exec tool implementation)
- `src/engine/tools/exec-background.ts` (create — background process manager + companion tools)
- `src/engine/tools/bash.ts` (modify — deprecation alias to exec)
- `src/engine/tools/index.ts` (modify — replace bashTool with execTool in getBuiltinTools)
- `src/engine/agent/prompt.ts` (modify — update tool summary for exec)
- `package.json` (modify — add node-pty dependency)

## Verification
- Run: `bun test`
- Expected: Existing tests pass; exec tool executes commands with all parameter combinations
- Edge cases: yieldMs race condition (process finishes before yield), pty fallback when node-pty unavailable, env override merging, timeout cleanup of background processes
