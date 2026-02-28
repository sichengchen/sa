---
id: 130
title: fix: heartbeat automation does not notify or schedule correctly
status: active
type: fix
priority: 1
phase: 009-chat-sdk-and-agent-tools
branch: fix/heartbeat-automation-reliability
created: 2026-02-28
---
# fix: heartbeat automation does not notify or schedule correctly

## Context

The current heartbeat path runs the main agent and writes `engine.heartbeat`, but it never delivers unsuppressed output to the user. In practice, heartbeat can appear "dead" even when the model produces a valid response, because the only visible side effect is a console log.

The implementation also diverges from the documented automation behavior:

- Heartbeat does not write an automation log under `~/.sa/automation/`, unlike cron and webhook tasks.
- `intervalMinutes` allows values up to 1440, but heartbeat encodes the interval as `*/N` in the cron minute field, which only behaves correctly for minute-based steps that fit the minute field. Values above 59 are unreliable.
- Existing tests cover file writes and exact suppress-token matching, but they do not cover notification delivery, automation logging, or long-interval scheduling behavior.

This is in scope for Phase 9 because heartbeat is part of the engine automation surface and must behave predictably and loudly when it is supposed to surface user-facing status.

## Approach

1. Refactor heartbeat task construction so the handler has access to the runtime pieces it needs for user-facing delivery, not just `saHome` and `mainAgent`.
2. Add a delivery path for unsuppressed heartbeat results:
   use the existing notification mechanism (or equivalent connector-safe path) so heartbeat reports reach the user instead of only `console.log`.
3. Add heartbeat run logging under `~/.sa/automation/`, matching the rest of the automation subsystem and making heartbeat runs auditable.
4. Replace the invalid `*/N` minute-field scheduling approach for heartbeat:
   preserve the documented `1..1440` range by using elapsed-time scheduling logic (or equivalent runtime-safe interval handling) so long intervals still fire correctly.
5. Tighten the heartbeat API/config behavior so runtime updates and startup registration use the same scheduling rules.
6. Update specs to match the actual behavior and API names after the code change.
7. Add regression tests that prove:
   unsuppressed heartbeat results are delivered,
   heartbeat writes automation logs,
   long intervals (for example 120 minutes) behave correctly,
   suppression still works exactly as intended.

## Files to change

- `src/engine/scheduler.ts` (modify — heartbeat handler currently only writes state + logs to stdout; scheduling logic is also encoded incorrectly for long intervals)
- `src/engine/runtime.ts` (modify — heartbeat registration will likely need runtime context, not only `saHome` + `mainAgent`)
- `src/engine/procedures.ts` (modify — keep `heartbeat.configure` in sync with the new scheduling behavior)
- `src/engine/server.ts` (modify if needed — keep manual/webhook heartbeat trigger aligned with the refactored heartbeat execution path)
- `specs/automation.md` (modify — align docs with actual heartbeat delivery, logging, and API behavior)
- `tests/heartbeat.test.ts` (modify — add delivery/logging/suppression coverage)
- `tests/scheduler.test.ts` (modify — add long-interval scheduling coverage)
- `tests/procedures.test.ts` (modify — cover `heartbeat.configure` / `heartbeat.trigger` against the updated behavior)

## Verification

- Run: `bun run typecheck`
- Run: `bun test tests/heartbeat.test.ts tests/scheduler.test.ts tests/webhook-tasks.test.ts`
- Run: `bun test tests/procedures.test.ts`
- Manual: start SA, trigger `heartbeat.trigger` (or `POST /webhook/heartbeat`) with a checklist that should produce a visible message
- Expected: unsuppressed heartbeat output is delivered through the configured user-facing path, `engine.heartbeat` is updated, and a heartbeat run log is written under `~/.sa/automation/`
- Regression check: cron tasks and webhook tasks still log correctly; suppress-token responses remain silent; heartbeat intervals above 59 minutes still fire on the expected cadence

## Progress

- Milestones: 4 commits
- Modified: `src/engine/scheduler.ts`, `src/engine/runtime.ts`, `src/engine/procedures.ts`, `tests/heartbeat.test.ts`, `tests/scheduler.test.ts`, `tests/procedures.test.ts`, `specs/automation.md`
- Verification: partial — `bun test tests/heartbeat.test.ts tests/scheduler.test.ts` and `bun test tests/webhook-tasks.test.ts` passed; `bun test tests/procedures.test.ts` is blocked locally because `zod` is not installed in this workspace
