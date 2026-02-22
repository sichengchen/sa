---
phase: 006-full-stack-polish
title: "Full-Stack Polish"
status: active
---

# Phase 6: Full-Stack Polish

## Goal
Broad sweep across five explored areas — testing infrastructure, automation, group chat, path aliases, and skill-based agent orchestration. Each area uses the minimal recommended approach from its exploration. Every plan in this phase must include tests.

## In Scope
- **Test infrastructure + guidance**: Shared helpers (temp-dir, live-model, test-tools), TESTING.md agent guidance doc, live LLM tests for agent chat loop and tRPC API (P0 gaps)
- **Path aliases**: tsconfig path aliases (`@sa/engine`, `@sa/shared`, etc.) for clean imports — zero structural change
- **Automation — 3-tier session model**:
  - **Main session**: Persistent engine-level session, not tied to any connector. Heartbeat runs here with full conversational context. Accumulates long-term awareness.
  - **Connector sessions**: Per connector (or per-chat for groups). Telegram, Discord, TUI each get their own.
  - **Cron sessions**: Isolated per task, created on demand, no shared context. For exact-timing standalone tasks.
- **Automation — Heartbeat overhaul**: Configurable interval (default 30 min), reads `HEARTBEAT.md` checklist, runs in main session, smart suppression (`HEARTBEAT_OK`), notifies only when something needs attention
- **Automation — Cron dispatch**: Wire the existing stub, persist tasks in config.json, one-shot scheduling (`--at`), result logging to `~/.sa/automation/`
- **Automation — Webhook-triggered tasks**: Route inbound webhooks to automation task prompts
- **Notify tool**: Push messages to Telegram/Discord from within the agent loop (for heartbeat results, cron outputs, alerts)
- **Skill-based agent orchestration**: Write orchestration skills for Claude Code / Codex one-shot mode using existing exec tool — zero engine code changes
- **Group chat**: Mention-gated filtering for Telegram + Discord, text-based sender attribution, group-specific session IDs (connector sessions per chat), system prompt group chat guidance
- **TruffleHog secret scanning**: Add TruffleHog to CI for automated credential leak detection

## Out of Scope (deferred)
- Full Turborepo monorepo restructure (exploration 001 — path aliases only)
- Full event bus, workflow DSL, declarative triggers (exploration 003 — cron + webhook + skills only)
- Interactive agent control: stdin pipes, structured output parsing, agent registry (exploration 002 — skills only)
- TUI component tests (no good Ink testing story with Bun yet)
- CI integration for live LLM tests (live tests exist but skip without API key)

## Acceptance Criteria
- [ ] `tests/helpers/` exists with temp-dir, live-model, and test-tools utilities
- [ ] TESTING.md exists at project root with agent-readable testing guidance
- [ ] Live LLM tests cover agent chat loop (text response, tool use, multi-turn) and tRPC chat.stream
- [ ] tsconfig path aliases work — all cross-boundary imports use `@sa/*` syntax
- [ ] Session IDs use structured format: `<prefix>:<session-id>` (e.g., `main:<id>`, `telegram:<chatId>:<id>`)
- [ ] `SessionManager` supports `create(prefix)`, `getLatest(prefix)`, `listByPrefix(prefix)`
- [ ] `/new` command creates a fresh session under the same prefix, preserving previous session history
- [ ] Engine creates a persistent `main` session at startup; heartbeat runs in it
- [ ] Heartbeat reads `HEARTBEAT.md` checklist, runs agent in main session, suppresses `HEARTBEAT_OK`
- [ ] `cron.add` dispatches prompts to isolated agent sessions (not a stub)
- [ ] One-shot scheduling works for time-delayed tasks
- [ ] Scheduled tasks persist in config.json and restore on engine restart
- [ ] Webhook payloads can trigger automation tasks via `/webhook/tasks/:slug`
- [ ] `notify` tool sends messages to connectors from within the agent loop
- [ ] At least one orchestration skill (Claude Code) works via exec in one-shot mode
- [ ] Telegram and Discord connectors only respond when @mentioned or replied to in groups
- [ ] Group chats get isolated session histories and sender attribution
- [ ] TruffleHog secret scan runs in CI and blocks PRs with verified secret leaks
- [ ] Every plan includes tests for new/changed code
- [ ] `bun run typecheck`, `bun run lint`, and `bun test` all pass

## Phase Notes
Phase 5 shipped cleanly — no carry-forward items. This phase follows the minimal recommended approach from each exploration to avoid over-engineering. Key constraint: every plan must include tests (enforced as a phase rule).

### Session Architecture (new in Phase 6)

**Structured session IDs** — session IDs are human-readable strings with a `<prefix>:<session-id>` format. The prefix encodes the type and context; the session-id is a unique suffix (short ID or UUID). Users can `/new` to create a fresh session within the same context.

```
Format: <prefix>:<session-id>

main:<id>                         — engine-level main session (singleton, created at startup)
cron:<task-name>:<id>             — isolated per cron task (e.g., cron:daily-report:a1b2c3)
tui:<id>                          — TUI connector session (/new creates a new one)
telegram:<chatId>:<id>            — Telegram per-chat (e.g., telegram:123456:x7y8z9)
discord:<channelId>:<id>          — Discord per-channel (e.g., discord:1234567890:k4m5n6)
webhook:<slug>:<id>               — webhook-triggered task session
```

`SessionManager` API:
- `create(prefix, connectorType) → Session` — creates a new session under the prefix with a unique ID
- `getSession(fullId) → Session` — get by full session ID
- `listByPrefix(prefix) → Session[]` — list all sessions under a prefix
- `getLatest(prefix) → Session` — get the most recently active session for a prefix

Connectors track the "current session" per chat context. `/new` calls `create(prefix)` and switches to the new session. The previous session is preserved (history is not lost).
```

## Shipped Plans
- Plan 063 — Test infrastructure + guidance: Shared temp directory lifecycle helper, live LLM model factory, echo/fail/slow test tools, TESTING.md agent guidance doc. Files: temp-dir.ts, live-model.ts, test-tools.ts, helpers.test.ts, TESTING.md, CONSTITUTION.md
- Plan 072 — Main session + heartbeat overhaul: Structured prefix:id session IDs, main session at startup, agent-based heartbeat with HEARTBEAT.md checklist and smart suppression. Files: sessions.ts, runtime.ts, scheduler.ts, procedures.ts, types.ts, defaults.ts, server.ts, SKILL.md
- Plan 064 — Live LLM agent chat tests: 6 live tests for agent chat loop using Haiku — text response, tool use, multi-turn, event order, approval callback, clearHistory. Files: tests/live/agent-chat.test.ts
- Plan 065 — tRPC API tests: 13 non-live + 2 live tRPC procedure tests covering session CRUD, cron, model, heartbeat, chat.stream. Files: tests/procedures.test.ts, tests/live/procedures.test.ts
- Plan 066 — Migrate imports to path aliases: 56 test imports migrated from relative to @sa/* aliases. Files: 22 test files
- Plan 067 — Cron dispatch + persistence + one-shot: Wired cron.add to isolated agent sessions, one-shot auto-removal, config persistence, result logging. Files: scheduler.ts, procedures.ts, runtime.ts, types.ts
- Plan 068 — Notify tool: Push messages to Telegram/Discord via HTTP from agent loop. Files: notify.ts, notify.test.ts, runtime.ts, SKILL.md
- Plan 070 — Mention-gated IM filtering: Pure-function mention/reply gates for Telegram and Discord group chats. Files: telegram/formatter.ts, telegram/transport.ts, discord/formatter.ts, discord/transport.ts, telegram.test.ts, discord-filter.test.ts
- Plan 071 — Group chat sender attribution + sessions: Per-chat session tracking with Map, sender name prefix for group messages, system prompt group guidance. Files: procedures.ts, telegram/transport.ts, discord/transport.ts, runtime.ts
- Plan 073 — Webhook-triggered automation tasks: Bearer token auth, /webhook/agent + /webhook/tasks/:slug + /webhook/heartbeat routes, webhook task CRUD. Files: types.ts, server.ts, procedures.ts, webhook-tasks.test.ts
- Plan 074 — TruffleHog secret scanning in CI: Added secret-scan job with --only-verified --fail. Files: .github/workflows/ci.yml
- Plan 075 — Comprehensive docs bundled in sa skill: Relocate docs/ into sa skill directory as single source of truth (8 docs, 4200+ lines). Files: architecture.md, configuration.md, tools.md, development.md, skills.md, sessions.md, automation.md, security.md, SKILL.md, README.md, CONSTITUTION.md, embed-skills.ts, loader.ts, Wizard.tsx
- Plan 069 — Skill-based agent orchestration: Claude Code and Codex orchestration skills for delegating coding tasks via exec. Files: claude-code/SKILL.md, codex/SKILL.md, skills.test.ts
- Plan 076 — fix: remove legacy webhook secret auth, enforce bearer token on all routes: Remove legacy secret branch from authenticateWebhook, enforce bearer-token-only on all webhook routes. Files: server.ts, types.ts, webhook-tasks.test.ts, security.md, configuration.md, architecture.md
- Plan 077 — fix: trigger only heartbeat for manual heartbeat APIs: Add Scheduler.runTask() for isolated task execution, use for heartbeat.trigger and /webhook/heartbeat. Files: scheduler.ts, procedures.ts, server.ts, scheduler.test.ts
- Plan 078 — fix: remove restored one-shot cron tasks from persisted config: Add onComplete callback for restored one-shot tasks to remove from config.json. Files: runtime.ts, scheduler.test.ts
- Plan 079 — fix: re-register heartbeat schedule when interval changes: Add Scheduler.updateSchedule() and call from heartbeat.configure. Files: scheduler.ts, procedures.ts, scheduler.test.ts
- Plan 080 — fix: honor cron task model override during execution: Add modelOverride to Agent, wire through cron task execution. Files: types.ts, agent.ts, procedures.ts, runtime.ts, agent.test.ts
- Plan 081 — Convert ClawHub tools to bundled skill: Move the tool logic into standalone scripts that the agent can invoke via `exec`. Files: search.ts, install.ts, update.ts, SKILL.md, procedures.ts, runtime.ts, index.ts, tools.md, skills.md, clawhub.test.ts
- Plan 082 — Remove ClawHub integration from engine: Delete engine clawhub module, move client/types/installer into bundled skill lib/. Files: client.ts, types.ts, installer.ts, procedures.ts, prompt.ts, CLAUDE.md, clawhub.test.ts

## Post-Review Findings (2026-02-22)
- [ ] **[P1] Enforce legacy webhook secret on task + heartbeat routes** (`src/engine/server.ts`): `authenticateWebhook` only checks `webhook.secret` when a request body is passed, so `/webhook/tasks/:slug` and `/webhook/heartbeat` are not protected when token auth is unset.
- [ ] **[P1] Trigger only heartbeat for manual heartbeat APIs** (`src/engine/procedures.ts`, `src/engine/server.ts`): `heartbeat.trigger` and `/webhook/heartbeat` call `runtime.scheduler.tick()`, which can also run unrelated user cron jobs due in the same minute.
- [ ] **[P2] Remove restored one-shot cron tasks from persisted config** (`src/engine/runtime.ts`): restored one-shot tasks are registered without completion cleanup, so they can be restored and run again after restart.
- [ ] **[P2] Re-register heartbeat schedule when interval changes** (`src/engine/procedures.ts`): `heartbeat.configure` mutates in-memory config only; scheduler cron expression is not updated until restart.
- [ ] **[P2] Honor cron task model override during execution** (`src/engine/procedures.ts`, `src/engine/runtime.ts`): `cron.add` accepts/persists `model`, but cron execution always uses runtime active model.
