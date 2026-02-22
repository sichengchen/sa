---
id: 077
title: "fix: trigger only heartbeat for manual heartbeat APIs"
status: pending
type: fix
priority: 1
phase: 006-full-stack-polish
branch: fix/heartbeat-only-trigger
created: 2026-02-22
---

# fix: trigger only heartbeat for manual heartbeat APIs

## Context
`heartbeat.trigger` (procedures.ts:859) and `/webhook/heartbeat` (server.ts:302) both call `runtime.scheduler.tick()`, which iterates **all** registered tasks and runs any whose cron expression matches the current minute. This means a manual heartbeat trigger can also fire unrelated user cron jobs that happen to be due.

The intent of these APIs is to trigger only the heartbeat, not all scheduled tasks.

## Approach
1. Add a `runTask(name: string)` method to `Scheduler` that runs a single named task by name, bypassing cron matching and the lastRun guard.
2. Update `heartbeat.trigger` in procedures.ts to call `runtime.scheduler.runTask("heartbeat")` instead of `runtime.scheduler.tick()`.
3. Update `handleWebhookHeartbeat` in server.ts to call `runtime.scheduler.runTask("heartbeat")` instead of `runtime.scheduler.tick()`.
4. Add a test verifying that `runTask("heartbeat")` runs only the heartbeat handler and not other registered tasks.

## Files to change
- `src/engine/scheduler.ts` (modify — add `runTask(name)` method)
- `src/engine/procedures.ts` (modify — `heartbeat.trigger` uses `runTask`)
- `src/engine/server.ts` (modify — `handleWebhookHeartbeat` uses `runTask`)
- `tests/procedures.test.ts` (modify — add test for isolated heartbeat trigger)

## Verification
- Run: `bun test tests/procedures.test.ts`
- Expected: heartbeat trigger runs only the heartbeat task, not other cron jobs due in the same minute
- Regression check: `scheduler.tick()` still runs all matching tasks on its normal interval
