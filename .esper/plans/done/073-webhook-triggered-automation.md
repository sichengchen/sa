---
id: 73
title: Webhook-triggered automation tasks
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Webhook-triggered automation tasks

## Context
SA already has a `POST /webhook` endpoint (`src/engine/server.ts:28-147`) that accepts messages, creates/resumes sessions, and returns agent responses via SSE or JSON. This plan renames it to `POST /webhook/agent` to sit alongside the other webhook routes under a unified `/webhook/*` namespace. External systems (GitHub Actions, n8n, Home Assistant, etc.) can trigger SA via webhook. However, there's no way to route specific webhook payloads to specific automation tasks or prompts — every webhook just becomes a chat message.

With cron dispatch (plan 067) providing the isolated-session agent dispatch infrastructure, webhook-triggered tasks can reuse the same dispatch mechanism: create a session, run an agent with a prompt, log results.

Plan 072 introduces the main session and `heartbeat.trigger` tRPC procedure. This plan adds an HTTP webhook surface for triggering heartbeats without needing the tRPC client.

## Approach

### 1. Global bearer token authentication
Add a shared `webhookToken` to `RuntimeConfig.webhook` in config.json:
```ts
webhook?: {
  enabled: boolean;
  /** Shared bearer token for authenticating all webhook endpoints */
  token?: string;
  /** Legacy per-request secret (deprecated, kept for backwards compat) */
  secret?: string;
}
```

All webhook routes (`/webhook/agent`, `/webhook/tasks/:slug`, `/webhook/heartbeat`) check `Authorization: Bearer <token>` first:
- If `webhook.token` is configured, the request must include a matching `Authorization: Bearer <token>` header (timing-safe comparison).
- If no token is configured, the endpoint is open (local-only use case).
- The legacy `x-webhook-secret` / `body.secret` check on `POST /webhook/agent` remains for backwards compatibility but the bearer token takes precedence.

Extract the auth check into a shared `authenticateWebhook(req, webhookConfig)` helper in `server.ts` that returns `Response | null` (null = authenticated, Response = error).

Rename the existing `POST /webhook` endpoint to `POST /webhook/agent`. All webhook routes now live under the `/webhook/*` namespace:
- `POST /webhook/agent` — direct agent chat (existing functionality, renamed)
- `POST /webhook/tasks/:slug` — routed automation tasks
- `POST /webhook/heartbeat` — trigger heartbeat immediately

### 2. Add webhook task routing with connector delivery
Extend the `AutomationConfig` type with webhook task definitions:
```ts
interface WebhookTask {
  name: string;
  slug: string;           // URL path segment: /webhook/tasks/<slug>
  prompt: string;         // template with {{payload}} placeholder
  enabled: boolean;
  model?: string;         // optional model override
  connector?: ConnectorType; // which connector to deliver the response through (e.g. "telegram", "tui")
}
```
Add `webhookTasks?: WebhookTask[]` to `AutomationConfig`.

The `connector` field determines where the agent's response is delivered:
- **If set** (e.g. `"telegram"`): After the agent finishes, use the notify tool (plan 068) to push the response to the specified connector. The HTTP response still returns the result JSON for the caller.
- **If unset**: Response is only returned in the HTTP response (current behavior). The caller is responsible for routing the result.

This enables workflows like: GitHub webhook → SA processes the event → result pushed to Telegram.

### 3. Add routed webhook endpoint
Add `POST /webhook/tasks/:slug` route in `server.ts`:
- Authenticate via bearer token (shared `authenticateWebhook` helper)
- Look up the task by slug in `config.automation.webhookTasks`
- Return 404 if slug not found, 403 if task disabled
- Interpolate `{{payload}}` in the prompt template with the request body (JSON stringified)
- Dispatch to an isolated agent session (reuse the same dispatch infrastructure as cron)
- If `connector` is configured, push result to that connector via notify tool
- Return the agent's response as JSON

### 4. Add heartbeat trigger webhook
Add `POST /webhook/heartbeat` route in `server.ts`:
- Authenticate via bearer token (shared `authenticateWebhook` helper)
- Calls the same underlying heartbeat trigger logic as the `heartbeat.trigger` tRPC procedure (plan 072)
- Returns `{ triggered: true }` on success
- This enables external systems (monitoring, Home Assistant, phone shortcuts, etc.) to poke the heartbeat without needing a tRPC client

### 5. tRPC procedures for webhook task management
Add:
- `automation.webhookTask.list` — list configured webhook tasks
- `automation.webhookTask.add` — create a new webhook task (with optional `connector` field)
- `automation.webhookTask.update` — update an existing webhook task
- `automation.webhookTask.remove` — remove a webhook task

### 6. Persist in config.json
Same pattern as cron tasks — stored in `config.automation.webhookTasks`, persisted via ConfigManager. The global `webhook.token` is stored in `config.runtime.webhook.token`.

### 7. Result logging
Reuse the same `~/.sa/automation/` logging from plan 067.

## Files to change
- `src/engine/config/types.ts` (modify — add `token` to webhook config, add WebhookTask with `connector` field to AutomationConfig)
- `src/engine/config/defaults.ts` (modify — default empty webhookTasks)
- `src/engine/server.ts` (modify — rename `/webhook` → `/webhook/agent`, extract `authenticateWebhook` helper, add `/webhook/tasks/:slug` and `/webhook/heartbeat` routes, refactor to use bearer token)
- `src/engine/procedures.ts` (modify — add automation.webhookTask CRUD procedures)
- `src/engine/runtime.ts` (modify — pass webhook task config to server)
- `tests/webhook-tasks.test.ts` (create — test bearer auth, slug routing, connector delivery, heartbeat trigger, prompt interpolation, dispatch)

## Verification
- Run: `bun test tests/webhook-tasks.test.ts`
- Expected: Tests pass for: bearer token auth (valid, invalid, missing when required, open when unconfigured), slug routing, connector delivery field, heartbeat trigger endpoint, prompt interpolation, missing slug 404, disabled task rejection
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Manual: Set `webhook.token` in config.json, `curl -X POST http://127.0.0.1:7420/webhook/tasks/my-task -H "Authorization: Bearer <token>" -d '{"event":"test"}'`, verify agent runs with interpolated prompt
- Manual: `curl -X POST http://127.0.0.1:7420/webhook/heartbeat -H "Authorization: Bearer <token>"`, verify heartbeat triggers immediately
- Manual: Create a webhook task with `connector: "telegram"`, trigger it, verify response is pushed to Telegram
- Edge cases: Unknown slug (404); disabled task (403); missing bearer token when required (401); invalid bearer token (401); very large payload (truncate before interpolation); concurrent webhook triggers for same task (each gets its own session); heartbeat trigger when heartbeat is disabled (409)

## Progress
- Added WebhookTask interface with slug, prompt template, connector delivery field
- Added `token` to webhook config for bearer token authentication
- Refactored server.ts: extracted `authenticateWebhook` helper, renamed `/webhook` → `/webhook/agent` (with backward compat), added `/webhook/tasks/:slug` and `/webhook/heartbeat` routes
- `/webhook/tasks/:slug` dispatches to isolated agent sessions with {{payload}} interpolation, result logging, and optional connector delivery via notify tool
- `/webhook/heartbeat` triggers scheduler.tick() with auth
- Added 4 webhook task CRUD procedures (list/add/update/remove) with slug uniqueness validation
- Created tests/webhook-tasks.test.ts with 30 tests covering types, prompt interpolation, bearer auth, slug routing, URL patterns, payload truncation
- Modified: types.ts, server.ts, procedures.ts
- Created: tests/webhook-tasks.test.ts
- Verification: 441 pass, 9 skip, 0 fail; typecheck clean; lint clean
