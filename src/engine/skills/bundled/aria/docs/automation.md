# Automation

## Overview

Esperta Aria supports three automation mechanisms: **heartbeat**, **cron**, and **webhook tasks**. All log results to `~/.aria/automation/`. Config lives in `config.json` under `runtime.heartbeat` and `runtime.automation`. Tasks persist across engine restarts and now track run metadata (`lastRunAt`, `nextRunAt`, `lastStatus`, `lastSummary`). Individual automation runs also persist attempt counts and delivery outcomes in the operational store.

---

## Heartbeat

Agent-based periodic check running in the **main session**. The agent reads a user-defined checklist and either reports issues or suppresses the notification.

### Configuration (`runtime.heartbeat`)

| Field              | Type    | Default          | Description                                       |
|--------------------|---------|------------------|---------------------------------------------------|
| `enabled`          | boolean | `true`           | Whether the heartbeat agent runs on each cycle    |
| `intervalMinutes`  | number  | `30`             | Minutes between heartbeat checks                  |
| `checklistPath`    | string  | `"HEARTBEAT.md"` | Path to checklist, relative to `ARIA_HOME`          |
| `suppressToken`    | string  | `"HEARTBEAT_OK"` | Exact response that suppresses user notification  |

### How It Works

1. Scheduler fires every `intervalMinutes`. Heartbeat uses a fixed minute interval, not cron step syntax, so values like `120` or `480` work correctly.
2. Health JSON is written to `~/.aria/engine.heartbeat` on every cycle (pid, memory, timestamp).
3. A heartbeat run log is written to `~/.aria/automation/heartbeat-<timestamp>.md` on every cycle.
4. If `enabled` and a main agent exists, engine reads `~/.aria/HEARTBEAT.md`.
5. Agent handles each checklist item; replies with exactly `HEARTBEAT_OK` if nothing needs attention.
6. **Smart suppression**: if response equals the suppress token, result is marked `suppressed: true` and no notification is sent.
7. If the response is not suppressed, Esperta Aria attempts to push it through the `notify` tool (Telegram/Discord if configured) and also writes the result to the engine log.

### Checklist File (`~/.aria/HEARTBEAT.md`)

User-editable Markdown. Read fresh on each cycle. Default:

```markdown
# Heartbeat checklist
- Check if any background tasks have completed -- summarize results
- If idle for 8+ hours, send a brief check-in
```

### tRPC API

| Procedure           | Type     | Description                                    |
|---------------------|----------|------------------------------------------------|
| `heartbeat.status`    | query    | Current config and last heartbeat result     |
| `heartbeat.configure` | mutation | Update `enabled` and/or `intervalMinutes`    |
| `heartbeat.trigger`   | mutation | Manually trigger a heartbeat check           |

### HTTP Endpoint

`POST /webhook/heartbeat` with `Authorization: Bearer <token>`. Requires `runtime.webhook.enabled: true`.

---

## Cron Dispatch

Scheduled tasks dispatch a prompt to a fresh, isolated agent session. Esperta Aria accepts classic cron expressions, natural-language cadence strings such as `every 2h`, short delays like `30m`, and absolute ISO timestamps for one-shot tasks.

### Task Fields

| Field            | Type      | Required | Description |
|------------------|-----------|----------|-------------|
| `name`           | string    | yes      | Unique task identifier |
| `schedule`       | string    | yes      | Cron expression, `every 2h`, `30m`, or ISO timestamp |
| `prompt`         | string    | yes      | Prompt sent to the agent |
| `enabled`        | boolean   | no       | Whether active (default: true) |
| `paused`         | boolean   | no       | Pause without deleting the task |
| `oneShot`        | boolean   | no       | Auto-remove after first execution |
| `model`          | string    | no       | Model override |
| `allowedTools`   | string[]  | no       | Explicit tool allowlist |
| `allowedToolsets`| string[]  | no       | Toolset names expanded at runtime |
| `skills`         | string[]  | no       | Skills injected into the task system prompt |
| `retryPolicy`    | object    | no       | Retry config: `maxAttempts`, `delaySeconds` |
| `delivery`       | object    | no       | Optional connector delivery target |
| `scheduleKind`   | enum      | no       | Derived scheduler mode: `cron`, `interval`, or `once` |
| `intervalMinutes`| number    | no       | Derived fixed interval for cadence schedules |
| `runAt`          | string    | no       | Absolute timestamp for one-shot tasks |
| `lastRunAt`      | string    | no       | Last execution timestamp |
| `nextRunAt`      | string    | no       | Next scheduled execution timestamp |
| `lastStatus`     | string    | no       | Last execution status: `success` or `error` |
| `lastSummary`    | string    | no       | Compact summary of the last run |

### Schedule Syntax

Esperta Aria normalizes four schedule forms:

| Input              | Meaning |
|--------------------|---------|
| `0 9 * * *`        | Cron: daily at 09:00 |
| `every 2h`         | Fixed interval every 120 minutes |
| `30m`              | One-shot run 30 minutes from now |
| `2026-04-07T15:30:00Z` | One-shot run at an absolute time |

Cron expressions use `minute hour day month weekday` and support `*`, `*/N`, and comma-separated values.

| Expression       | Meaning                            |
|------------------|------------------------------------|
| `0 9 * * *`      | Daily at 09:00                     |
| `*/15 * * * *`   | Every 15 minutes                   |
| `0 0 1 * *`      | First of month at midnight         |
| `30 17 * * 1,5`  | Monday and Friday at 17:30         |

### Session Isolation

Session ID: `cron:<taskName>:<id>`. Fresh agent per run -- no shared history.

### One-Shot Tasks

`oneShot: true` auto-unregisters the task after first execution and removes it from `config.json`. Useful for delayed one-time tasks.

### Persistence

Persisted in `config.json` at `runtime.automation.cronTasks`. Re-registered on engine startup through the same execution path used by `cron.add`, so restored tasks keep the same logging, delivery, and metadata updates as newly added tasks.

### Retry Policy

Failed cron runs can retry automatically. `retryPolicy.maxAttempts` includes the
initial attempt, and `retryPolicy.delaySeconds` controls the pause between
attempts.

```json
{
  "retryPolicy": {
    "maxAttempts": 3,
    "delaySeconds": 30
  }
}
```

### Result Logging

Each run writes to `~/.aria/automation/daily-summary-2026-02-22T09-00-00-000Z.md` (prompt, response, tool calls).

### Durable Run Metadata

Each persisted automation run records:

- `attemptNumber` and `maxAttempts`
- `deliveryStatus` (`not_requested`, `delivered`, `failed`)
- `deliveryError` when delivery fails
- `deliveryAttemptedAt` timestamp

### tRPC API

| Procedure     | Type     | Description                                   |
|---------------|----------|-----------------------------------------------|
| `cron.list`   | query    | List all tasks (built-in + user) with runtime metadata |
| `cron.add`    | mutation | Add a scheduled task |
| `cron.update` | mutation | Update schedule, prompt, tools, skills, or delivery |
| `cron.pause`  | mutation | Pause a task without deleting it |
| `cron.resume` | mutation | Resume a paused task |
| `cron.run`    | mutation | Trigger a task immediately |
| `cron.remove` | mutation | Remove a user task by name |

Built-in tasks (heartbeat) cannot be removed via `cron.remove`.

---

## Webhook-Triggered Tasks

Event-driven tasks triggered by HTTP POST from external systems. Each has a URL slug and a prompt template with payload interpolation.

### Task Fields

| Field            | Type      | Required | Description |
|------------------|-----------|----------|-------------|
| `name`           | string    | yes      | Human-readable name |
| `slug`           | string    | yes      | URL slug (alphanumeric, hyphens, underscores) |
| `prompt`         | string    | yes      | Prompt template; `{{payload}}` replaced with request body |
| `enabled`        | boolean   | yes      | Whether active |
| `model`          | string    | no       | Model override |
| `allowedTools`   | string[]  | no       | Explicit tool allowlist |
| `allowedToolsets`| string[]  | no       | Toolset names expanded at runtime |
| `skills`         | string[]  | no       | Skills injected into the task system prompt |
| `retryPolicy`    | object    | no       | Retry config: `maxAttempts`, `delaySeconds` |
| `delivery`       | object    | no       | Optional delivery target override |
| `lastRunAt`      | string    | no       | Last execution timestamp |
| `lastStatus`     | string    | no       | Last execution status |
| `lastSummary`    | string    | no       | Compact summary of the last run |

### HTTP Endpoint

`POST /webhook/tasks/<slug>` with `Authorization: Bearer <token>` and `Content-Type: application/json`. Requires `runtime.webhook.enabled: true` and slug matching an enabled task.

### Payload Interpolation

`{{payload}}` is replaced with the JSON-serialized request body. Payloads over **10,000 characters** are truncated. No body or invalid JSON defaults to `"{}"`.

### Connector Delivery

When `delivery.connector` is set, the `notify` tool pushes the final response to the specified connector. Delivery success or failure is persisted with the automation run.

### Session, Logging, and Delivery

Session ID: `webhook:<slug>:<id>`. Fresh agent per attempt. Logs written to `~/.aria/automation/`. Delivery uses `task.delivery.connector` after the final attempt completes.

### Persistence

Persisted in `config.json` at `runtime.automation.webhookTasks`.

### tRPC API

| Procedure              | Type     | Description                      |
|------------------------|----------|----------------------------------|
| `webhookTask.list`     | query    | List all webhook tasks           |
| `webhookTask.add`      | mutation | Add a webhook task               |
| `webhookTask.update`   | mutation | Update a task by slug            |
| `webhookTask.remove`   | mutation | Remove a task by slug            |

---

## Authentication

Both webhook endpoints use bearer token auth configured at `runtime.webhook.token`. Token comparison uses constant-time safe comparison.

---

## Decision Guide

| Mechanism | Trigger            | Session                     | Best For                                           |
|-----------|--------------------|-----------------------------|----------------------------------------------------|
| Heartbeat | Timer (periodic)   | Main session                | Periodic monitoring, status checks, idle check-ins |
| Cron      | Timer (scheduled)  | Isolated (`cron:<name>`)    | Scheduled tasks -- reports, cleanup, reminders     |
| Webhook   | HTTP POST          | Isolated (`webhook:<slug>`) | Event-driven -- GitHub, CI/CD, monitoring alerts   |
