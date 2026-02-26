---
id: 123
title: Coding agent subprocess infrastructure
status: done
type: feature
priority: 1
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# Coding agent subprocess infrastructure

## Context

The current skill-based approach to coding agents (claude-code, codex) delegates via `exec` + CLI commands. This is brittle: each invocation is a separate stateless process, auth detection relies on error message pattern matching, results are unstructured text (capped at 1MB), and there's no progress visibility.

The [happy](https://github.com/slopus/happy) project demonstrates a better pattern: subprocess lifecycle management with FD monitoring, structured state tracking, auth probing, and persistent session context.

This plan creates the shared infrastructure that both `claude_code` and `codex` native tools will use.

## Approach

1. Create `src/engine/tools/agent-subprocess.ts` — `AgentSubprocess` class:
   - **Process lifecycle**: Spawn coding agent CLI via `Bun.spawn()`, track PID, handle exit
   - **Auth probing**: `probeAuth(cli: string)` — run `claude --version` or `codex --version` to detect installation, then `claude auth status` (or equivalent) to check auth state without starting a task
   - **Structured output parsing**: Parse stdout for structured sections (diffs, file lists, test results). Extract JSON blocks if the CLI supports `--output-format json`
   - **Output streaming**: Collect stdout/stderr incrementally, emit progress events
   - **Timeout management**: Configurable timeout (default 5 minutes foreground, 30 minutes background)
   - **Abort support**: Kill subprocess on AbortSignal, clean up child processes
   - **Background execution**: Return handle immediately, poll for results via `getStatus(handle)`

2. Create `src/engine/tools/agent-subprocess-types.ts` — shared types:
   ```typescript
   interface AgentSubprocessConfig {
     cli: string;               // "claude" | "codex"
     args: string[];            // CLI arguments
     env?: Record<string, string>; // Extra env vars (API keys)
     workdir?: string;          // Working directory
     timeout?: number;          // Timeout in ms
     background?: boolean;      // Background mode
   }

   interface AgentSubprocessResult {
     status: "success" | "error" | "timeout" | "cancelled";
     exitCode: number;
     stdout: string;
     stderr: string;
     filesModified?: string[];  // Parsed from output
     summary?: string;          // Extracted summary
     duration: number;          // Elapsed ms
   }

   interface AgentAuthStatus {
     installed: boolean;
     version?: string;
     authenticated: boolean;
     authMethod?: "oauth" | "api_key" | "none";
   }
   ```

3. Create `src/engine/tools/agent-subprocess.test.ts` — unit tests:
   - Test auth probing with mock CLI
   - Test timeout handling
   - Test abort/cancel
   - Test structured output parsing

## Files to change

- `src/engine/tools/agent-subprocess.ts` (create — AgentSubprocess class)
- `src/engine/tools/agent-subprocess-types.ts` (create — shared types)
- `src/engine/tools/agent-subprocess.test.ts` (create — unit tests)

## Verification

- Run: `bun test src/engine/tools/agent-subprocess.test.ts`
- Expected: All tests pass — lifecycle, auth probing, timeout, abort
- Edge cases: CLI not installed, CLI installed but not authenticated, CLI hangs, CLI produces non-UTF8 output

## Progress
- Created AgentSubprocess module with functional API (probeAuth, runSubprocess, runBackground)
- Auth probing: claude CLI uses `auth status`, codex uses OPENAI_API_KEY env var check
- Structured output: parses diff headers and Modified/Created patterns for filesModified
- Background execution with handle-based polling via getBackgroundStatus
- Timeout with SIGTERM → 5s grace → SIGKILL escalation
- 14 unit tests covering: auth probe (not found, installed), run (success, error, timeout, workdir, env, diff parsing, summary), background (handle, completion, cleanup)
- Modified: src/engine/tools/ (3 new files)
- Verification: typecheck, lint, all 752 tests pass
