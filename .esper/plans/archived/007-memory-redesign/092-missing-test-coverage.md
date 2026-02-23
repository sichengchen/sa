---
id: 92
title: fix: add missing tests for agent timeout and memory embedding fallback
status: done
type: fix
priority: 2
phase: 007-memory-redesign
branch: fix/missing-test-coverage
created: 2026-02-23
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/25
---
# fix: add missing tests for agent timeout and memory embedding fallback

## Context

The audit identified two untested medium-severity code paths:

**1. Agent `AbortController` timeout logic (`agent.ts:42-45`)**
The agent uses an `AbortController` to cancel in-flight LLM requests when a timeout is exceeded. This is a critical safety valve — if it doesn't work, a hung request blocks the session indefinitely. The logic itself exists but has zero test coverage. A regression here would be silent.

**2. Memory embedding failure fallback (`memory/manager.ts:480-485`)**
When the remote embedding provider is unavailable or returns an error, the memory manager should fall back to BM25-only search rather than crashing. This fallback path exists but is untested. An embedding API outage would silently degrade to an uncaught error if the path has a bug.

Additional untested paths (low severity, include if straightforward):
- Session cleanup/destruction (`procedures.ts:461-467`) — `destroySession` clears agent state but is not covered by tests
- Temporal decay weighting — decay math has no unit test verifying the formula

## Approach

1. **Agent timeout test** — in `src/engine/agent/agent.test.ts` (or create it), add a test that:
   - Creates an agent with a short timeout (e.g., 100ms)
   - Mocks the LLM to delay longer than the timeout
   - Asserts the agent returns an error event (not a hang) and that `AbortController.abort()` was called

2. **Embedding fallback test** — in `src/engine/memory/manager.test.ts`, add a test that:
   - Configures the memory manager with a mock embedding provider that throws
   - Calls `search()` with a query
   - Asserts the result is a valid BM25-only response (not an uncaught exception)

3. **Session destroy test** (if straightforward) — in `src/engine/procedures.test.ts` or similar, verify `destroySession` removes the session from the map and returns `true` for existing session, `false` for missing session.

## Files to change

- [src/engine/agent/agent.test.ts](src/engine/agent/agent.test.ts) (create or modify — add timeout AbortController test)
- [src/engine/memory/manager.test.ts](src/engine/memory/manager.test.ts) (create or modify — add embedding failure fallback test)
- [src/engine/sessions.test.ts](src/engine/sessions.test.ts) (create or modify — add session destroy coverage, if not already present)

## Verification

- Run: `bun test src/engine/agent` — new timeout test must pass
- Run: `bun test src/engine/memory` — new embedding fallback test must pass
- Run: `bun test` — full suite must pass with no regressions
- Coverage check: the paths at `agent.ts:42-45` and `memory/manager.ts:480-485` should now be exercised

## Progress
- Created `src/engine/agent/agent.test.ts` with 3 timeout tests using `mock.module` for pi-ai:
  - Timeout between tool call rounds (multi-round, cumulative delay)
  - Timeout during tool execution (slow tool > timeout)
  - No timeout when timeoutMs=0
- Embedding fallback: already covered by existing `tests/memory-embeddings.test.ts:109` ("embedding failure falls back to BM25 gracefully")
- Created `src/engine/sessions.test.ts` with 8 tests: destroy existing/nonexistent/double-destroy, create/retrieve, list with exclusion, touchSession
- Modified: (none — test-only additions)
- Created: src/engine/agent/agent.test.ts, src/engine/sessions.test.ts
- Verification: 546 tests pass, lint clean, typecheck clean
