---
id: 76
title: fix: remove legacy webhook secret auth, enforce bearer token on all routes
status: done
type: fix
priority: 1
phase: 006-full-stack-polish
branch: fix/webhook-secret-enforcement
created: 2026-02-22
shipped_at: 2026-02-22
---
# fix: remove legacy webhook secret auth, enforce bearer token on all routes

## Context
`authenticateWebhook` in `src/engine/server.ts` supports two auth methods: bearer token (`Authorization: Bearer <token>`) and a legacy secret (`body.secret` or `x-webhook-secret` header). The legacy path only checks when a `body` parameter is passed, leaving `/webhook/tasks/:slug` and `/webhook/heartbeat` unprotected when only the legacy secret is configured.

Rather than fix the legacy path, remove it entirely. Bearer token auth is the only supported method going forward.

## Approach
1. Remove the legacy secret branch from `authenticateWebhook` — delete the `body` parameter and all `webhookConfig.secret` / `x-webhook-secret` / `body.secret` logic.
2. Remove the `secret` field from the `WebhookBody` interface (no longer needed in request bodies).
3. Remove `webhook.secret` from the config type if it exists (or mark deprecated — check `src/engine/config/types.ts`).
4. Update `handleWebhookAgent` to no longer pass `body` to `authenticateWebhook`.
5. Ensure all three webhook routes (`/webhook/agent`, `/webhook/tasks/:slug`, `/webhook/heartbeat`) use the same simplified `authenticateWebhook(req, webhookConfig)` call.
6. Update tests to remove legacy secret test cases and verify bearer-token-only enforcement on all routes.

## Files to change
- `src/engine/server.ts` (modify — simplify `authenticateWebhook` to bearer-token-only, remove `body` param, remove `secret` from `WebhookBody`)
- `src/engine/config/types.ts` (modify — remove `secret` from webhook config type if present)
- `tests/webhook-tasks.test.ts` (modify — remove legacy secret tests, add bearer-token enforcement tests for all routes)

## Verification
- Run: `bun test tests/webhook-tasks.test.ts`
- Expected: All routes return 401 without a valid bearer token; no legacy secret path remains
- Regression check: `/webhook/agent` works with bearer token auth

## Progress
- Removed `body` parameter and all legacy secret logic from `authenticateWebhook` (bearer-token only)
- Removed `secret` field from `WebhookBody` interface
- Removed `secret` field from webhook config type in `types.ts`
- Updated `handleWebhookAgent` to not pass `body` to `authenticateWebhook`
- Updated docs (security.md, configuration.md, architecture.md) and regenerated embedded skills
- Replaced legacy secret tests with 11 bearer-token-only enforcement tests covering all three routes
- Modified: `src/engine/server.ts`, `src/engine/config/types.ts`, `tests/webhook-tasks.test.ts`, `src/engine/skills/bundled/sa/docs/security.md`, `src/engine/skills/bundled/sa/docs/configuration.md`, `src/engine/skills/bundled/sa/docs/architecture.md`, `src/engine/skills/embedded-skills.generated.ts`
- Verification: all 34 webhook tests pass, typecheck clean, lint clean, full suite 451 pass / 0 fail
