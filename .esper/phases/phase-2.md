---
phase: phase-2
title: Engine Architecture, Skills & Multi-Transport
status: active
---

# Phase 2: Engine Architecture, Skills & Multi-Transport

## Goal
Split SA into a persistent background Engine (backend daemon) and thin Connectors (TUI, Telegram, Discord), connected via tRPC with device-flow authentication. Add an Agent Skills system (agentskills.io spec) with ClawHub registry integration and a cron/heartbeat scheduler. This transforms SA from a monolithic process into a client-server architecture ready for multiple IM Connectors and future macOS/iOS/watchOS apps.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  SA Engine (daemon)              │
│  Agent · Router · Memory · Tools · Skills · Cron │
│                  tRPC server                     │
└──────────┬──────────┬──────────┬────────────────┘
           │          │          │
    ┌──────┴──┐ ┌─────┴───┐ ┌───┴──────┐
    │ SA TUI  │ │ SA TG   │ │ SA       │
    │Connector│ │Connector│ │Discord   │
    │ (Ink)   │ │(Grammy) │ │Connector │
    └─────────┘ └─────────┘ └──────────┘
```

### Key Decisions
- **Naming**: Engine (backend) + Connectors (frontends, not "transports")
- **IPC**: tRPC — end-to-end TypeScript type safety, no codegen
- **Auth**: OAuth device flow — Engine shows a pairing code, Connector sends it to authenticate. Extends to remote/mobile later.
- **Tool execution**: Engine-only. If approval is needed, Engine sends a request to the active Connector, Connector shows UI, user approves/rejects.
- **Sessions**: Each Connector gets a separate session. Engine has cross-session access and can transfer sessions between Connectors.
- **Skills**: Agent Skills spec (agentskills.io) — SKILL.md files with YAML frontmatter, lazy-loaded prompt instructions. Not tools themselves — they teach the agent how to use tools.
- **ClawHub**: External registry (clawhub.ai) — search via vector embeddings, install via CLI, GitHub OAuth.

## In Scope
- Engine process: background daemon running Agent, Router, Memory, Tools, Skills, Cron
- tRPC router with typed procedures for chat, tools, sessions, skills, health
- Device-flow auth for Connector pairing
- Connector abstraction (generic interface for all frontends)
- TUI Connector (Ink, thin tRPC client)
- Telegram Connector (Grammy, tRPC client)
- Discord Connector (discord.js, tRPC client)
- Engine daemon management (`sa engine start/stop/status`, PID file, logging)
- Skills system following agentskills.io spec (SKILL.md, discovery, activation, execution)
- Skill creator skill (built-in meta-skill to scaffold new skills)
- ClawHub client (search/install skills from clawhub.ai)
- Cron & heartbeat scheduler in Engine
- Wizard updates for Discord, Engine config, skill management

## Out of Scope (deferred)
- Web UI frontend
- Multi-user support / auth / permissions
- WhatsApp, Slack, or other IM Connectors beyond Discord + Telegram
- macOS / iOS / watchOS native Connectors (future phases)
- MCP server support (may come later)

## Acceptance Criteria
- [ ] Engine runs as a background daemon (`sa engine start/stop/status`)
- [ ] Connectors authenticate with Engine via device-flow pairing
- [ ] TUI Connector connects to Engine via tRPC, same chat experience as Phase 1
- [ ] Telegram Connector connects to Engine via tRPC
- [ ] Discord Connector connects to Engine via tRPC and handles chat
- [ ] Tools execute in Engine; approval requests are sent to the active Connector
- [ ] Skills can be defined, loaded, and activated per agentskills.io spec
- [ ] Skill creator skill scaffolds a new SKILL.md interactively
- [ ] Skills can be searched and installed from ClawHub
- [ ] Cron scheduler runs periodic tasks in the Engine
- [ ] Wizard supports Discord setup and skill configuration
- [ ] All core subsystems have passing tests

## Phase Notes
Phase 1 shipped a working monolith with TUI + Telegram (17 plans, 76 tests). The Telegram transport is tightly coupled to the Agent class — Phase 2 must refactor this into a Connector interface. The existing `src/telegram/transport.ts` directly imports `Agent` and calls `agent.chat()`, which needs to go through tRPC.

The Agent Skills spec (agentskills.io) is an open standard by Anthropic adopted by ClawHub/OpenClaw, Claude Code, Cursor, and others. Skills are NOT tools — they are prompt-level documentation (SKILL.md) that teaches the agent how to use existing tools. Discovery is via name+description metadata; full instructions are lazy-loaded on activation.

## Shipped Plans
- #018 — tRPC router & Engine scaffolding: Install tRPC dependencies and create Engine entry point with HTTP + WS server and all procedure stubs. Files: package.json, tsconfig.json, trpc.ts, router.ts, context.ts, server.ts, index.ts, types.ts
- #019 — Connector interface & session management: Define Connector interface and implement SessionManager with tRPC client factory. Files: connector.ts, types.ts, client.ts, sessions.ts, router.ts, sessions.test.ts
- #020 — Agent runtime migration to Engine: Move Agent, Router, Memory, Tools into Engine process with per-session agents and tool approval flow. Files: runtime.ts, router.ts, server.ts, index.ts, agent.ts, types.ts
