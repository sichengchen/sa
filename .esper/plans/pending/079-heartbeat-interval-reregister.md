---
id: 079
title: "fix: re-register heartbeat schedule when interval changes"
status: pending
type: fix
priority: 2
phase: 006-full-stack-polish
branch: fix/heartbeat-interval-reregister
created: 2026-02-22
---

# fix: re-register heartbeat schedule when interval changes

## Context
`heartbeat.configure` in `src/engine/procedures.ts` (lines 843-856) mutates `heartbeatState.config` in memory when `intervalMinutes` changes, but does not update the scheduler's registered task. The heartbeat task's cron expression (e.g., `*/30 * * * *`) is set at registration time in `createHeartbeatTask` and never changes. The new interval only takes effect after a full engine restart.

## Approach
1. When `heartbeat.configure` receives a new `intervalMinutes`, re-register the heartbeat task with the updated cron expression.
2. Add a method to `Scheduler` (e.g., `updateSchedule(name, newSchedule)`) that updates the cron expression of an existing task in-place.
3. Call `runtime.scheduler.updateSchedule("heartbeat", \`*/\${input.intervalMinutes} * * * *\`)` in the `heartbeat.configure` mutation.
4. Add a test verifying the heartbeat fires at the new interval after reconfiguration.

## Files to change
- `src/engine/scheduler.ts` (modify — add `updateSchedule(name, schedule)` method)
- `src/engine/procedures.ts` (modify — call `updateSchedule` when intervalMinutes changes)
- `tests/procedures.test.ts` (modify — add test for interval change taking effect immediately)

## Verification
- Run: `bun test tests/procedures.test.ts`
- Expected: After calling `heartbeat.configure({ intervalMinutes: 5 })`, the scheduler uses `*/5 * * * *`
- Regression check: Other task schedules are unaffected; heartbeat still works correctly after reconfig
