---
phase: 009-chat-sdk-and-agent-tools
title: "Chat SDK & Agent Tools"
status: active
---

# Phase 9: Chat SDK & Agent Tools

## Goal

Expand SA to 8 chat platforms using Vercel's Chat SDK (`npm install chat`) for unified multi-platform connectors, add force-stop and restart commands for runtime control, and replace the brittle skill-based coding agent delegation with native tools that provide structured results, auth management, and subprocess state tracking.

Chat SDK provides a unified adapter pattern — write event handlers once, deploy across Slack, Teams, Google Chat, Discord, GitHub, and Linear. This replaces the existing Discord.js connector and adds 5 new platforms. Telegram stays on Grammy since Chat SDK doesn't support it.

The coding agent tools draw from patterns observed in the [happy](https://github.com/slopus/happy) project — subprocess lifecycle management, structured output parsing, persistent state, and auth probing — to replace the current skill-based approach (which suffers from context loss, auth fragility, and unstructured text output).

## In Scope

### Chat SDK Connectors (6 platforms)
- **Shared ChatSDKAdapter** bridge between Chat SDK events and SA's tRPC client
- **Slack** connector with full streaming, buttons, slash commands
- **Microsoft Teams** connector with Adaptive Cards
- **Google Chat** connector with Cards
- **Discord** connector (replace existing Discord.js with Chat SDK version)
- **GitHub** connector (mentions + reactions)
- **Linear** connector (mentions + reactions)
- **ConnectorType expansion** — add `slack`, `teams`, `gchat`, `github`, `linear` to type enum

### Runtime Control Commands
- **/stop** — force-cancel all running agent tasks and tool calls
- **/restart** — force SA engine stop and restart
- **/shutdown** - force SA engine stop (ask for confirmation)

### Native Coding Agent Tools
- **Subprocess infrastructure** — shared process manager for coding agent CLIs (lifecycle, state, auth probing, structured output)
- **claude_code** native tool — replace skill with ToolImpl (subprocess, auth, structured results)
- **codex** native tool — replace skill with ToolImpl (subprocess, auth, structured results)

## Out of Scope (deferred)

- Telegram Chat SDK support (no adapter available)
- Claude Agent SDK dual-backend (exploration 009 — separate phase)
- Computer Use integration
- Batch API for cron/bulk tasks
- Interactive multi-turn coding agent sessions (v1 is one-shot with context)
- JSX card components for TUI connector
- Chat SDK modal/form features beyond basic buttons

## Acceptance Criteria

- [ ] Chat SDK installed and shared adapter bridges events to tRPC
- [ ] Slack connector receives mentions, streams responses, shows tool approval buttons
- [ ] Teams connector receives mentions, streams responses with Adaptive Cards
- [ ] Google Chat connector receives mentions, streams responses
- [ ] Discord connector works via Chat SDK (old Discord.js connector removed)
- [ ] GitHub connector handles issue/PR mentions and reactions
- [ ] Linear connector handles mentions and reactions
- [ ] Onboarding and config wizard has the logic for configurating all connectors
- [ ] `/stop` cancels running agent work from any connector + `sa stop` CLI
- [ ] `/restart` restarts SA from any connector + `sa restart` CLI
- [ ] `/shutdown` stops SA engine with confirmation from any connector + `sa shutdown` CLI
- [ ] `claude_code` native tool delegates tasks with structured results (not skill-based)
- [ ] `codex` native tool delegates tasks with structured results (not skill-based)
- [ ] Auth probing works for both Claude Code and Codex CLIs
- [ ] `bun run typecheck`, `bun run lint`, and `bun test` all pass
- [ ] All README, docs, specs updated

## Phase Notes

Phase 8 shipped cleanly with 15 plans — full security model v2, subagents, audit logging, OS sandbox. No carry-forward items.

Happy project (github.com/slopus/happy) informs the coding agent tool design — subprocess FD 3 monitoring, message queue pattern, persistent session state, and RPC-based remote abort.

## Shipped Plans
- Plan 113 — ConnectorType expansion for Chat SDK platforms: Add "slack", "teams", "gchat", "github", "linear" to ConnectorTypeSchema. Files: types.ts, defaults.ts
- Plan 114 — Chat SDK base adapter: Shared ChatSDKAdapter bridges Chat SDK events to SA's tRPC client. Files: adapter.ts, client.ts, formatter.ts, index.ts
- Plan 123 — Coding agent subprocess infrastructure: Shared process manager for coding agent CLIs with auth probing, output parsing, timeout, background execution. Files: agent-subprocess.ts, agent-subprocess-types.ts, agent-subprocess.test.ts
- Plan 115 — Slack connector via Chat SDK: Slack adapter with webhook server and `sa slack` CLI. Files: connectors/slack/
- Plan 116 — Teams connector via Chat SDK: Teams adapter with webhook server and `sa teams` CLI. Files: connectors/teams/
- Plan 117 — Google Chat connector via Chat SDK: GChat adapter with webhook server and `sa gchat` CLI. Files: connectors/gchat/
- Plan 119 — GitHub connector via Chat SDK: GitHub adapter with webhook server and `sa github` CLI. Files: connectors/github/
- Plan 120 — Linear connector via Chat SDK: Linear adapter with webhook server and `sa linear` CLI. Files: connectors/linear/
