---
id: 80
title: fix: honor cron task model override during execution
status: done
type: fix
priority: 2
phase: 006-full-stack-polish
branch: fix/cron-model-override
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/17
---
# fix: honor cron task model override during execution

## Context
`cron.add` in `src/engine/procedures.ts` accepts and persists a `model` parameter, but `registerCronTask` (line 65) calls `runtime.createAgent()` without passing the model override. The agent always uses the runtime's active model. Similarly, restored cron tasks in `runtime.ts` (line 240) create `new Agent({ router, tools, systemPrompt })` without a model override.

The `model` field is accepted in the API, persisted to config, but never actually used during execution.

## Approach
1. Pass the `model` override to the agent when executing cron tasks. This likely means:
   - Adding a `modelOverride` option to `Agent` constructor or `runtime.createAgent()`.
   - OR temporarily switching the model on the router for the duration of the task (risky, affects other sessions).
   - Best approach: Add a `modelOverride` option to `Agent` that overrides the router's active model for that agent instance.
2. Update `registerCronTask` to pass `opts.model` to the agent.
3. Update the restored task handler in `runtime.ts` to pass `task.model` to the agent.
4. Add a test verifying the model override is passed through.

## Files to change
- `src/engine/agent/index.ts` (modify — accept optional `modelOverride` in Agent options)
- `src/engine/procedures.ts` (modify — pass model to agent in `registerCronTask`)
- `src/engine/runtime.ts` (modify — pass model to agent for restored tasks)
- `tests/procedures.test.ts` (modify — add test verifying model override is respected)

## Verification
- Run: `bun test tests/procedures.test.ts`
- Expected: A cron task with `model: "eco"` uses the eco model, not the active model
- Regression check: Tasks without a model override still use the runtime's active model

## Progress
- Added `modelOverride` option to `AgentOptions` in `types.ts`
- Agent's `chat()` now passes `modelOverride` to `router.getModel()` and `router.getStreamOptions()`
- Updated `registerCronTask` to pass `opts.model` to `runtime.createAgent()`
- Updated `runtime.ts` createAgent interface to accept `modelOverride`, and restored cron task handler to pass `task.model`
- Updated test mocks in `procedures.test.ts` and `live/procedures.test.ts` to accept `modelOverride`
- Added test in `agent.test.ts` verifying Agent accepts `modelOverride`
- Modified: `src/engine/agent/types.ts`, `src/engine/agent/agent.ts`, `src/engine/procedures.ts`, `src/engine/runtime.ts`, `tests/agent.test.ts`, `tests/procedures.test.ts`, `tests/live/procedures.test.ts`
- Verification: full suite 461 pass / 0 fail, typecheck clean, lint clean
