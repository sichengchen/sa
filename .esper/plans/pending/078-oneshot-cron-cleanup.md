---
id: 078
title: "fix: remove restored one-shot cron tasks from persisted config"
status: pending
type: fix
priority: 2
phase: 006-full-stack-polish
branch: fix/oneshot-cron-cleanup
created: 2026-02-22
---

# fix: remove restored one-shot cron tasks from persisted config

## Context
In `src/engine/runtime.ts` (lines 230-252), persisted cron tasks are restored on startup and registered with the scheduler. However, restored one-shot tasks are registered without an `onComplete` callback, so when they fire:
1. The scheduler removes them from memory (via `oneShot` flag).
2. But they are **never removed from config.json**.
3. On the next engine restart, they get restored and can run again.

Compare with `registerCronTask` in procedures.ts (line 103), which correctly passes an `onComplete` callback that calls `removeCronTaskFromConfig`.

## Approach
1. In `runtime.ts`, when restoring one-shot tasks, pass an `onComplete` callback that removes the task from config.json — mirror what `registerCronTask` in procedures.ts does.
2. Alternatively, extract a shared helper that both call sites use to avoid duplication.
3. Add a test that verifies a restored one-shot task is removed from config after execution.

## Files to change
- `src/engine/runtime.ts` (modify — add `onComplete` callback for restored one-shot tasks)
- `tests/procedures.test.ts` (modify — add test for one-shot cleanup on restore)

## Verification
- Run: `bun test tests/procedures.test.ts`
- Expected: After a restored one-shot task fires, it is removed from config.json
- Regression check: Non-one-shot tasks are not removed; newly added one-shot tasks still clean up correctly
