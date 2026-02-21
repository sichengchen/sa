---
phase: phase-2
title: Engine Architecture, Skills & Multi-Transport
status: completed
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
- [x] Engine runs as a background daemon (`sa engine start/stop/status`)
- [x] Connectors authenticate with Engine via device-flow pairing
- [x] TUI Connector connects to Engine via tRPC, same chat experience as Phase 1
- [x] Telegram Connector connects to Engine via tRPC
- [x] Discord Connector connects to Engine via tRPC and handles chat
- [x] Tools execute in Engine; approval requests are sent to the active Connector
- [x] Skills can be defined, loaded, and activated per agentskills.io spec
- [x] Skill creator skill scaffolds a new SKILL.md interactively
- [x] Skills can be searched and installed from ClawHub
- [x] Cron scheduler runs periodic tasks in the Engine
- [x] Wizard supports Discord setup and skill configuration
- [x] All core subsystems have passing tests

## Phase Notes
Phase 1 shipped a working monolith with TUI + Telegram (17 plans, 76 tests). The Telegram transport is tightly coupled to the Agent class — Phase 2 must refactor this into a Connector interface. The existing `src/telegram/transport.ts` directly imports `Agent` and calls `agent.chat()`, which needs to go through tRPC.

The Agent Skills spec (agentskills.io) is an open standard by Anthropic adopted by ClawHub/OpenClaw, Claude Code, Cursor, and others. Skills are NOT tools — they are prompt-level documentation (SKILL.md) that teaches the agent how to use existing tools. Discovery is via name+description metadata; full instructions are lazy-loaded on activation.

## Shipped Plans
- #018 — tRPC router & Engine scaffolding: Install tRPC dependencies and create Engine entry point with HTTP + WS server and all procedure stubs. Files: package.json, tsconfig.json, trpc.ts, router.ts, context.ts, server.ts, index.ts, types.ts
- #019 — Connector interface & session management: Define Connector interface and implement SessionManager with tRPC client factory. Files: connector.ts, types.ts, client.ts, sessions.ts, router.ts, sessions.test.ts
- #020 — Agent runtime migration to Engine: Move Agent, Router, Memory, Tools into Engine process with per-session agents and tool approval flow. Files: runtime.ts, router.ts, server.ts, index.ts, agent.ts, types.ts
- #021 — Engine daemon mode: CLI daemon management (start/stop/status/logs/restart) with PID file and discovery URL. Files: cli/index.ts, cli/engine.ts, server.ts, index.ts, package.json
- #022 — Device-flow authentication: AuthManager with master token, pairing codes, and session token validation. Files: auth.ts, router.ts, runtime.ts, server.ts, context.ts, client.ts, auth.test.ts
- #023 — TUI Connector: Thin tRPC client TUI with /new, /status, /model slash commands. Files: connectors/tui/App.tsx, StatusBar.tsx, client.ts, index.ts
- #024 — Telegram Connector: Grammy-based tRPC client with /pair, /new, /status, /model and inline keyboard tool approval. Files: connectors/telegram/client.ts, transport.ts, formatter.ts, index.ts
- #025 — Discord Connector: discord.js-based tRPC client with /new, /status, /model and button tool approval. Files: connectors/discord/client.ts, transport.ts, formatter.ts, index.ts
- #026 — Skills system core: Create skill type definitions, SKILL.md scanner/parser, SkillRegistry, and XML prompt generation following agentskills.io spec. Files: types.ts, loader.ts, registry.ts, prompt.ts, index.ts, read-skill.ts, runtime.ts, router.ts, skills.test.ts
- #028 — ClawHub client integration: ClawHub API client with vector search, skill download/install, and local registry tracking. Files: client.ts, installer.ts, types.ts, index.ts, clawhub-search.ts, runtime.ts, router.ts, clawhub.test.ts
- #027 — Skill creator skill: Built-in meta-skill that scaffolds new SKILL.md files with proper frontmatter and directory structure. Files: bundled/skill-creator/SKILL.md, registry.ts
- #029 — Cron & heartbeat scheduler: Interval-based cron scheduler with 5-field expression parser, heartbeat built-in task, and tRPC procedures. Files: scheduler.ts, runtime.ts, router.ts, scheduler.test.ts
- #030 — Wizard updates for Phase 2: Add Discord and Skills wizard steps, update Welcome with Engine architecture, extend Confirm summary. Files: DiscordSetup.tsx, SkillSetup.tsx, Welcome.tsx, Wizard.tsx, Confirm.tsx, types.ts
- #032 — Split providers and models in config schema: Add ProviderConfig interface and update ModelConfig/ModelsFile to v2 schema with separate providers and models arrays. Files: types.ts, router.ts, defaults.ts, App.tsx, Input.tsx, ModelPicker.tsx, transport.ts, Wizard.tsx, ModelSetup.tsx, index.ts
- #031 — Add OpenRouter as a built-in provider: Add "openrouter" to ProviderType, PROVIDER_OPTIONS, and fetchModelList in the wizard. Files: ModelSetup.tsx
- #034 — Replace ClawHub integration with bundled skill: Keep ClawHub client as library, create standalone clawhub_search/install/update tools, add bundled clawhub SKILL.md, remove from engine runtime and tRPC. Files: SKILL.md, clawhub-search.ts, clawhub-install.ts, clawhub-update.ts, index.ts, runtime.ts, procedures.ts, SkillSetup.tsx, clawhub.test.ts
- #033 — sa config CLI: Merge models.json into config.json (v3 schema), create interactive `sa config` CLI with Provider/Model/Connector/Memory screens. Files: types.ts, manager.ts, defaults.ts, router.ts, types.ts, index.ts, runtime.ts, Wizard.tsx, cli/index.ts, ConfigMenu.tsx, ProviderManager.tsx, ModelManager.tsx, ConnectorSettings.tsx, MemorySettings.tsx
- #035 — Bundled skills library & wizard skill picker: Add 10 bundled SKILL.md files from upstream sources and redesign wizard SkillSetup as multi-select checklist. Files: 10x SKILL.md, SkillSetup.tsx, Confirm.tsx, Wizard.tsx, CONSTITUTION.md
- #037 — Prompt engineering for skill/tool compliance with weaker models: Restructure system prompt assembly with mandatory skill scan directive, tool-call style section, enriched skill descriptions with "Use when / NOT for" routing, tool summaries with behavioral hints, and skill catalog size limits. Files: runtime.ts, prompt.ts, types.ts, index.ts, bash.ts, read.ts, write.ts, edit.ts, remember.ts, read-skill.ts, 12x SKILL.md, prompt.test.ts
- #036 — Agent loop safeguards: Remove maxToolRounds hard cap, replace with unbounded loop + 600s timeout + 3-tier tool loop detection + 400k char result size guard. Files: agent.ts, types.ts, index.ts, tool-loop-detection.ts, tool-result-guard.ts, architecture.md, tool-loop-detection.test.ts, tool-result-guard.test.ts
- #038 — fix: copy selected bundled skills to ~/.sa/skills/ during onboarding: Export BUNDLED_SKILLS_DIR and add cp loop in Wizard handleConfirm. Files: registry.ts, Wizard.tsx
- #039 — fix: create missing shell scripts for apple-calendar bundled skill: Create 7 AppleScript wrapper shell scripts for apple-calendar, 2 reference docs for 1password, and interpolate {baseDir} in skill content. Files: cal-list.sh, cal-events.sh, cal-read.sh, cal-create.sh, cal-update.sh, cal-delete.sh, cal-search.sh, get-started.md, cli-examples.md, registry.ts
- #040 — fix: Telegram streaming replies stack instead of editing in-place: Add promise-chain edit lock to serialize async send/edit operations, fix throttle gating, catch "message not modified" errors, register Telegram slash commands, extract shared stream handler. Files: stream-handler.ts, transport.ts (telegram), transport.ts (discord)
