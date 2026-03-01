---
id: 2
title: Rebuild stream context after sanitizing retry history
status: active
type: fix
lane: atomic
priority: 1
created: 2026-03-01
spec: specs/engine.md
---
# Rebuild stream context after sanitizing retry history

## Context

In `Agent.chat()`, the retry loop for transient provider errors has a stale-reference bug. The `context` object (containing `messages`, `tools`, `systemPrompt`) is created **before** the retry `for` loop at line 125. When a retryable error occurs, `sanitizeHistoryForRetry()` assigns a **new array** to `this.messages` (line 338), but `context.messages` still points to the old array. Subsequent retry attempts call `stream(model, context, ...)` with the unsanitized history, so failures like Gemini `thought_signature` errors repeat on every attempt instead of recovering.

## Scope

1. After `this.messages = sanitizeHistoryForRetry(this.messages)` on line 338, update `context.messages` to reference the new array so retries use sanitized history.
2. Add a unit test that verifies `context.messages` reflects the sanitized history on retry.

## Files Affected
- `src/engine/agent/agent.ts` (modify — add `context.messages = this.messages` after sanitization)
- `src/engine/agent/agent.test.ts` (modify — add test for retry context rebuild)

## Verification
- Run: `bun test src/engine/agent/agent.test.ts`
- Expected: new retry-context test passes; existing tests unchanged
- Run: `bun run typecheck`
- Expected: no type errors

## Spec Impact
- None — this is a bugfix with no API or behavior change beyond correcting the retry path

## Progress
- [x] Added `context.messages = this.messages;` after sanitization in `agent.ts:339`
- [x] Added regression test `passes sanitized history to stream on retry after retryable error`
- [x] `bun test src/engine/agent/agent.test.ts` — 4/4 pass
- [x] `bun run typecheck` — pre-existing error only (unrelated `@chat-adapter/telegram`)
