<img width="2000" height="506" alt="Frame 7-2" src="https://github.com/user-attachments/assets/16e538f9-7e0a-4594-b9f0-2979675e1aa3" />

# Esperta Base

Personal AI agent assistant.

## Install

```bash
brew install sichengchen/tap/esperta-base
```

Update with `brew upgrade esperta-base`.

### Service

```bash
brew services start esperta-base     # start engine, auto-start on login
brew services stop esperta-base      # stop engine
brew services restart esperta-base   # restart
```

Or manage manually with `esperta-base engine start/stop/restart/status/logs`.

## Architecture

The **Engine** runs as a background daemon and owns the agent loop, tools, memory, session archive, checkpoints, skills, MCP integrations, scheduler, audio transcription, and model routing. **Connectors** (Telegram, Slack, Teams, Google Chat, Discord, GitHub, Linear) auto-start with the Engine when configured. The **TUI** is launched on-demand. **Webhook** endpoints (`/webhook/agent`, `/webhook/tasks/:slug`, `/webhook/heartbeat`) allow external systems to send messages, trigger automation tasks, and invoke heartbeat checks programmatically. Six connectors share a unified **Chat SDK adapter** — Telegram stays on Grammy. Session tokens are scoped to their paired connector identity; admin surfaces remain master-token only.

## Development

```bash
git clone https://github.com/sichengchen/esperta-base.git
cd esperta-base
bun install
bun run dev            # starts Engine (if needed) + opens TUI
```

On first run, an onboarding wizard configures identity, model/provider settings, and optional connectors. Config is saved to `~/.sa/` (or `SA_HOME` if set).

| Command | Purpose |
|---------|---------|
| `bun run dev` | Run from source |
| `bun run build` | Bundle to `dist/` |
| `bun test` | Run tests |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript check |
| `bun run version:bump` | Bump CalVer + tag |

## Esperta Base CLI

Preferred command: `esperta-base`. Compatibility alias: `sa`.

```text
esperta-base                      Start Engine (if needed) and open the TUI
esperta-base onboard              Run the onboarding wizard
esperta-base config               Open interactive config editor (providers/models/connectors/memory)
esperta-base engine start         Start the Engine as a background daemon
esperta-base engine stop          Stop the running Engine
esperta-base engine status        Show Engine status
esperta-base engine logs          Show recent Engine logs
esperta-base engine restart       Restart the Engine
esperta-base stop                 Force-cancel all running agent tasks
esperta-base restart              Restart the Engine via tRPC
esperta-base shutdown             Shut down the Engine gracefully
esperta-base help                 Show help
```

## Skills

- Bundled skills ship in `src/engine/skills/bundled/`
- User-installed/local skills live in `~/.sa/skills/<skill-name>/SKILL.md`
- The agent can create and patch reusable user skills through the `skill_manage` tool
- `skill.reload` and successful `skill_manage` mutations refresh the runtime skill catalog for subsequent turns without restarting the Engine

## Documentation

System docs live in [`specs/`](specs/README.md). Key sections:

- [Overview](specs/overview.md) — Architecture, subsystems, agent loop, model router, tRPC API
- [Configuration](specs/configuration.md) — Config schema, providers, models, tiers, aliases
- [Tools](specs/tools/README.md) — Danger classification, approval matrix, per-tool config
- [Security](specs/security/README.md) — Threat model, approval flow, exec classifier, secrets vault, auth
- [Automation](specs/automation.md) — Heartbeat, cron, webhooks
- [Sessions](specs/sessions.md) — 3-tier session model, structured IDs
- [Skills](specs/skills.md) — SKILL.md format, discovery, ClawHub
- [Development](specs/development.md) — Testing, CI/CD, CalVer, contributing

## Config location

Config lives in `~/.sa/` by default. Override with `SA_HOME`.

```text
~/.sa/
  IDENTITY.md       # agent name, personality, system prompt
  USER.md           # user profile (name, timezone, preferences)
  config.json       # runtime + providers + models config
  secrets.enc       # encrypted API keys and connector secrets
  .salt             # local salt used for secrets encryption key derivation
  memory/           # persistent memory files
  skills/           # installed skills
  checkpoints/      # shadow git repos used for rollback checkpoints
  session-archive.sqlite # persisted session transcripts + search index
  engine.url        # Engine discovery file (written at startup)
  engine.pid        # Engine PID file
  engine.token      # Engine auth token file
  engine.log        # Engine log output
  engine.heartbeat  # heartbeat metadata written by scheduler
```
