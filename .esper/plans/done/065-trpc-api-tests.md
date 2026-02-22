---
id: 65
title: tRPC API tests
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# tRPC API tests

## Context
The entire tRPC API surface (`src/engine/procedures.ts`, 602 lines) is untested. This includes session CRUD, model management, skill listing, cron management, and critically `chat.stream` — the main conversation endpoint. `procedures.ts` uses `protectedProcedure` (auth middleware from `context.ts`), module-level `sessionAgents` map, and `filterAgentEvents` for per-connector event filtering.

The tRPC server runs on `127.0.0.1:7420` (HTTP) and `:7421` (WS). Tests need to either call procedures directly (bypass tRPC transport) or spin up a test server.

## Approach

### 1. Non-live tRPC tests: `tests/procedures.test.ts`
Test procedures that don't require an LLM by calling the router directly (no HTTP server needed). Use `createCallerFactory` from tRPC or invoke the router's procedures with a mock context.

**Test cases (non-live):**
1. **session.create** — creates a session, returns valid Session object
2. **session.list** — returns all sessions
3. **session.destroy** — removes session, verify gone from list
4. **cron.list** — returns registered tasks (at minimum the heartbeat builtin)
5. **cron.add** — registers a task, verify it appears in cron.list
6. **cron.remove** — removes a user task, verify gone; verify builtin tasks can't be removed
7. **skill.list** — returns bundled skills
8. **model.list** — returns configured models
9. **model.switch** — switches active model

### 2. Live tRPC tests: `tests/live/procedures.test.ts`
Wrapped in `describeLive()`. Spin up a minimal runtime and test server, or call procedures directly with a real router.

**Test cases (live):**
1. **chat.stream end-to-end** — create session, subscribe to chat.stream with a simple prompt, collect events, assert `text_delta` + `done`
2. **chat.stream with tool use** — register echoTool, prompt triggers tool, assert `tool_start` + `tool_end` events pass through
3. **filterAgentEvents connector filtering** — verify TUI gets `tool_start`, IM connectors get `tool_end` instead

### 3. Test for `filterAgentEvents`
Since `filterAgentEvents` is a pure-ish async generator transform, it can be tested with a mock event stream (no LLM needed). Add to `tests/procedures.test.ts`.

## Files to change
- `tests/procedures.test.ts` (create — non-live tRPC procedure tests)
- `tests/live/procedures.test.ts` (create — live chat.stream tests)

## Verification
- Run: `bun test tests/procedures.test.ts`
- Expected: All non-live tests pass without API key
- Run: `ANTHROPIC_API_KEY=sk-... bun test tests/live/procedures.test.ts`
- Expected: Live tests pass (~5-15s each)
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Edge cases: Runtime initialization may need a temp SA_HOME to avoid touching real config; auth tokens need to be generated for test context

## Progress
- Created tests/procedures.test.ts with 13 non-live tests: health.ping, session CRUD, cron list/add/remove, model list/active, heartbeat.status, mainSession.info
- Created tests/live/procedures.test.ts with 2 live tests: chat.stream text response, chat.stream tool use
- Built createTestRuntime/createLiveTestRuntime factories for isolated tRPC testing
- Modified: tests/procedures.test.ts, tests/live/procedures.test.ts
- Verification: 362 pass, 9 skip, 0 fail; typecheck clean; lint clean
