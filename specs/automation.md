# Automation

## Overview

SA supports three automation mechanisms: **heartbeat**, **cron**, and **webhook tasks**. All create isolated agent sessions, dispatch prompts, and log results to `~/.sa/automation/`. Config lives in `config.json` under `runtime.heartbeat` and `runtime.automation`. Tasks persist across engine restarts.

---

## Heartbeat

Agent-based periodic check running in the **main session**. The agent reads a user-defined checklist and either reports issues or suppresses the notification.

### Configuration (`runtime.heartbeat`)

| Field              | Type    | Default          | Description                                       |
|--------------------|---------|------------------|---------------------------------------------------|
| `enabled`          | boolean | `true`           | Whether the heartbeat agent runs on each cycle    |
| `intervalMinutes`  | number  | `30`             | Minutes between heartbeat checks                  |
| `checklistPath`    | string  | `"HEARTBEAT.md"` | Path to checklist, relative to `SA_HOME`          |
| `suppressToken`    | string  | `"HEARTBEAT_OK"` | Exact response that suppresses user notification  |

### How It Works

1. Scheduler fires every `intervalMinutes`. Health JSON written to `~/.sa/engine.heartbeat` on every cycle (pid, memory, timestamp).
2. If `enabled` and a main agent exists, engine reads `~/.sa/HEARTBEAT.md`.
3. Agent handles each checklist item; replies with exactly `HEARTBEAT_OK` if nothing needs attention.
4. **Smart suppression**: if response equals the suppress token, result is marked `suppressed: true` and no notification is sent.

### Checklist File (`~/.sa/HEARTBEAT.md`)

User-editable Markdown. Read fresh on each cycle. Default:

```markdown
# Heartbeat checklist
- Check if any background tasks have completed -- summarize results
- If idle for 8+ hours, send a brief check-in
```

### tRPC API

| Procedure           | Type     | Description                                    |
|---------------------|----------|------------------------------------------------|
| `heartbeat.status`  | query    | Current config and last heartbeat result       |
| `heartbeat.update`  | mutation | Update `enabled` and/or `intervalMinutes`      |
| `heartbeat.trigger` | mutation | Manually trigger a heartbeat check             |

### HTTP Endpoint

`POST /webhook/heartbeat` with `Authorization: Bearer <token>`. Requires `runtime.webhook.enabled: true`.

---

## Cron Dispatch

Scheduled tasks on 5-field cron expressions. Each dispatches a prompt to a fresh, isolated agent session.

### Task Fields

| Field      | Type    | Required | Description                                              |
|------------|---------|----------|----------------------------------------------------------|
| `name`     | string  | yes      | Unique task identifier                                   |
| `schedule` | string  | yes      | 5-field cron (minute hour day month weekday)             |
| `prompt`   | string  | yes      | Prompt sent to the agent                                 |
| `enabled`  | boolean | no       | Whether active (default: true)                           |
| `oneShot`  | boolean | no       | Auto-remove after first execution                        |
| `model`    | string  | no       | Model override                                           |

### Cron Expression Syntax

`minute hour day month weekday` -- supports `*`, `*/N`, comma-separated values.

| Expression       | Meaning                            |
|------------------|------------------------------------|
| `0 9 * * *`      | Daily at 09:00                     |
| `*/15 * * * *`   | Every 15 minutes                   |
| `0 0 1 * *`      | First of month at midnight         |
| `30 17 * * 1,5`  | Monday and Friday at 17:30         |

### Session Isolation

Session ID: `cron:<taskName>`. Fresh agent per run -- no shared history.

### One-Shot Tasks

`oneShot: true` auto-unregisters the task after first execution and removes it from `config.json`. Useful for delayed one-time tasks.

### Persistence

Persisted in `config.json` at `runtime.automation.cronTasks`. Re-registered on engine startup.

### Result Logging

Each run writes to `~/.sa/automation/daily-summary-2026-02-22T09-00-00-000Z.md` (prompt, response, tool calls).

### tRPC API

| Procedure     | Type     | Description                                   |
|---------------|----------|-----------------------------------------------|
| `cron.list`   | query    | List all tasks (built-in + user)              |
| `cron.add`    | mutation | Add a scheduled task                          |
| `cron.remove` | mutation | Remove a user task by name                    |

Built-in tasks (heartbeat) cannot be removed via `cron.remove`.

---

## Webhook-Triggered Tasks

Event-driven tasks triggered by HTTP POST from external systems. Each has a URL slug and a prompt template with payload interpolation.

### Task Fields

| Field       | Type    | Required | Description                                                |
|-------------|---------|----------|------------------------------------------------------------|
| `name`      | string  | yes      | Human-readable name                                        |
| `slug`      | string  | yes      | URL slug (alphanumeric, hyphens, underscores)              |
| `prompt`    | string  | yes      | Prompt template; `{{payload}}` replaced with request body  |
| `enabled`   | boolean | yes      | Whether active                                             |
| `model`     | string  | no       | Model override                                             |
| `connector` | string  | no       | Deliver response via `"telegram"` or `"discord"`           |

### HTTP Endpoint

`POST /webhook/tasks/<slug>` with `Authorization: Bearer <token>` and `Content-Type: application/json`. Requires `runtime.webhook.enabled: true` and slug matching an enabled task.

### Payload Interpolation

`{{payload}}` is replaced with the JSON-serialized request body. Payloads over **10,000 characters** are truncated. No body or invalid JSON defaults to `"{}"`.

### Connector Delivery

When `connector` is set, the `notify` tool pushes the response to the specified connector. Notification failure is non-fatal.

### Session & Logging

Session ID: `webhook:<slug>`. Fresh agent per run. Logs written to `~/.sa/automation/`.

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
