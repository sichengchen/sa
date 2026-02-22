---
id: 67
title: Cron dispatch + persistence + one-shot scheduling
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Cron dispatch + persistence + one-shot scheduling

## Context
The cron scheduler (`src/engine/scheduler.ts`) is fully functional — it parses 5-field cron syntax, ticks every 60s, and runs the heartbeat task. But `cron.add` in `procedures.ts` (line 584) is a stub: it registers a handler that only `console.log`s instead of dispatching the prompt to an agent. Scheduled tasks are also purely in-memory — engine restart loses them. `RuntimeConfig` has no automation/scheduling types.

Cron tasks are **isolated** — each runs in its own session with no conversational context from the main session. This is distinct from heartbeat (plan 072), which runs in the main session with full context. Cron is for exact-timing standalone tasks: daily reports, weekly analyses, one-shot reminders.

Key infrastructure: `SessionManager` can create `"webhook"` sessions (auto-approve safe/moderate tools). `runtime.createAgent()` creates a fresh agent. The `sessionAgents` map in procedures.ts tracks session→agent bindings.

## Approach

### 1. Add automation types to `RuntimeConfig`
In `src/engine/config/types.ts`, add:
```ts
interface CronTask {
  name: string;
  schedule: string;     // 5-field cron
  prompt: string;
  enabled: boolean;
  oneShot?: boolean;    // if true, remove after first execution
  model?: string;       // optional model override (e.g., use eco tier for cheap tasks)
}

interface AutomationConfig {
  cronTasks: CronTask[];
  heartbeat?: HeartbeatConfig;  // see plan 072
}
```
Add `automation?: AutomationConfig` to `RuntimeConfig`.

### 2. Wire cron.add handler to dispatch to agent
In `procedures.ts`, replace the `console.log` stub with a real handler:
- Create an isolated cron session using the structured ID convention: `runtime.sessions.create("cron:<task-name>", "cron")` which generates a full ID like `cron:daily-report:a1b2c3`. For recurring tasks, use `getLatest("cron:<task-name>")` to resume the existing session or `create` for a fresh one. One-shot tasks always `create` a new session.
- Add `"cron"` to `ConnectorType` in `shared/types.ts`
- Create an agent via `runtime.createAgent()` — optionally with a model override if `task.model` is set
- Run `agent.chat(prompt)`, collect events
- Log results to `~/.sa/automation/<name>-<timestamp>.md`
- If `oneShot`, unregister the task after execution, remove from config, and destroy the session

### 3. One-shot scheduling (`--at` / `runAt`)
Add a `cron.addOneShot` procedure (or extend `cron.add` with a `runAt` field):
- Accepts an ISO timestamp or relative duration (e.g., "20m", "2h", "tomorrow 9am")
- Converts to a cron expression or stores as a one-shot with a `runAt` timestamp
- After execution, auto-removes from scheduler and config
- Use case: "remind me in 20 minutes" → one-shot cron task

### 4. Persist tasks in config.json
When `cron.add` succeeds, write the task to `config.automation.cronTasks` via `ConfigManager`.
When `cron.remove` succeeds, remove it from config. One-shot tasks auto-remove after execution.

### 5. Restore tasks at startup
In `runtime.ts`, after scheduler is created and heartbeat is registered, iterate `config.automation.cronTasks` and register each enabled task with the scheduler using the dispatch handler.

### 6. Add result logging
Create `~/.sa/automation/` directory. After each cron task run, write a markdown file:
```markdown
# <task-name> — <ISO timestamp>
## Prompt
<prompt>
## Response
<collected text from agent events>
## Tool calls
- <tool_name>: <summary>
```

### 7. Update cron.remove
Ensure removing a task also removes it from `config.automation.cronTasks`.

## Files to change
- `src/engine/config/types.ts` (modify — add CronTask, AutomationConfig to RuntimeConfig)
- `src/engine/config/defaults.ts` (modify — add default automation config)
- `src/shared/types.ts` (modify — add "cron" to ConnectorType)
- `src/engine/procedures.ts` (modify — wire cron.add handler using `create("cron:<name>", "cron")` / `getLatest("cron:<name>")`, add cron.addOneShot, update cron.remove)
- `src/engine/runtime.ts` (modify — restore persisted tasks at startup)
- `src/engine/scheduler.ts` (modify — support one-shot tasks that auto-unregister)
- `tests/cron-dispatch.test.ts` (create — test task persistence, restore, one-shot, handler wiring, structured session IDs)

## Verification
- Run: `bun test tests/cron-dispatch.test.ts`
- Expected: Tests pass for persistence, restore, one-shot auto-removal, and removal
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Manual: Start engine, `cron.add` a task with `"* * * * *"` schedule, wait 1 minute, check `~/.sa/automation/` for result log
- Edge cases: Task with same name as builtin (reject); empty prompt (reject); invalid cron syntax (reject); engine restart preserves tasks; one-shot task runs exactly once then disappears; expired one-shot tasks at startup (skip, don't run)

## Progress
- Added CronTask, AutomationConfig types to config/types.ts; added "cron" ConnectorType
- Wired cron.add to dispatch prompts to isolated cron:name agent sessions with result logging to ~/.sa/automation/
- Added one-shot support to Scheduler (oneShot flag + onComplete callback, auto-removes after tick)
- Persisted tasks to config.json via automation.cronTasks; restore at engine startup
- Updated cron.remove to also remove from config persistence
- Created tests/cron-dispatch.test.ts (8 tests)
- Modified: shared/types.ts, config/types.ts, scheduler.ts, procedures.ts, runtime.ts
- Verification: 370 pass, 9 skip, 0 fail; typecheck clean; lint clean
