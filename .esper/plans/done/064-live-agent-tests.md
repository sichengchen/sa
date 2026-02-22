---
id: 64
title: Live LLM agent chat tests
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Live LLM agent chat tests

## Context
The agent chat loop (`src/engine/agent/agent.ts`) is the core product feature — it yields `AgentEvent` via async generator — and has zero test coverage. The E2E smoke test explicitly comments: "We can't call agent.chat() without a real LLM." With test helpers from plan 063, we can now write live tests using Haiku.

`Agent.chat(userText: string)` yields: `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `tool_approval_request`, `warning`, `done`, `error`. Constructor takes `AgentOptions` with `router`, `tools`, `systemPrompt`, `timeoutMs`, `toolLoopDetection`, `maxToolResultChars`, `onToolApproval`.

## Approach

### Create `tests/live/agent-chat.test.ts`
All wrapped in `describeLive()` (skips without API key). Each test creates a fresh `Agent` with `makeLiveRouter()`.

**Test cases:**
1. **Single-turn text response** — Send a simple prompt ("Say hello"), assert `text_delta` events emitted, `done` event at end with `stopReason`.
2. **Tool use round-trip** — Register `echoTool`, prompt "Use the echo tool with message test123", assert `tool_start` (name === "echo"), `tool_end` (has result), then `done`.
3. **Multi-turn conversation** — Send two messages sequentially, verify `getMessages()` accumulates history (4+ messages: user1, assistant1, user2, assistant2).
4. **Streaming event order** — Collect all event types, verify `text_delta` appears before `done`, no `error` events in a normal flow.
5. **Tool approval callback** — Register a tool, provide `onToolApproval` that returns `"approve"`, verify tool executes. Then test with `"reject"` — verify tool is skipped.
6. **Clear history** — Chat once, `clearHistory()`, verify `getMessages()` is empty.

**Assertion patterns:**
- Assert event types and tool names, never exact text content
- Generous timeouts: 15s for text-only, 30s for tool use
- Directive prompts to reduce non-determinism

## Files to change
- `tests/live/agent-chat.test.ts` (create — 6 live test cases)

## Verification
- Run: `ANTHROPIC_API_KEY=sk-... bun test tests/live/agent-chat.test.ts`
- Expected: All 6 tests pass (each ~2-10s)
- Run: `bun test tests/live/` (without API key)
- Expected: Tests skip gracefully, exit code 0
- Edge cases: Flaky assertions — use structural checks only; generous timeouts for API latency

## Progress
- Created tests/live/agent-chat.test.ts with 6 test cases: single-turn text, tool use round-trip, multi-turn history, streaming event order, tool approval callback, clearHistory
- All tests use describeLive() — skip gracefully without API key (verified: 6 skip, 0 fail)
- Uses shared helpers: makeLiveRouter(), echoTool from plan 063
- Modified: tests/live/agent-chat.test.ts
- Verification: typecheck clean, lint clean, tests skip gracefully without key
