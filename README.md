# SA (Sasa)

A personal AI agent assistant for myself.

## Architecture

The **Engine** runs as a background daemon that owns the agent, tools, memory, skills, and scheduler. **Connectors** (Telegram, Discord) are IM frontends that auto-start with the Engine when configured. The **TUI** is the terminal interface, launched on-demand.

```
                      ┌──────────┐   ┌──────────┐
                      │ Telegram │   │ Discord  │
                      │Connector │   │Connector │
                      └────┬─────┘   └────┬─────┘
    ┌──────┐               │              │
    │ TUI  │───────────────┼──────────────┘
    └──────┘               │ tRPC (HTTP + WS)
                     ┌─────┴─────┐
                     │  SA Engine │
                     │  (daemon)  │
                     └─────┬─────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
          ┌───┴───┐  ┌────┴────┐  ┌───┴────┐
          │ Agent │  │  Skills  │  │ClawHub │
          │ + LLM │  │ Registry │  │Registry│
          └───────┘  └─────────┘  └────────┘
```

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- API key for at least one LLM provider (Anthropic, OpenAI, or Google)
- Optional: Telegram bot token and/or Discord bot token

## Quickstart

```bash
git clone <repo-url> sa
cd sa
bun install
cp .env.example .env   # fill in your API keys
sa                      # starts Engine + opens TUI
```

On first run, a setup wizard walks you through identity, model configuration, and optional Telegram/Discord setup. Config is saved to `~/.sa/`.

When the Engine starts, it auto-launches any configured IM connectors (Telegram and/or Discord). The TUI opens on-demand when you run `sa`.

## SA CLI

```
sa                      Onboard (if first run), start Engine, open TUI
sa onboard              Run the onboarding wizard
sa engine start         Start the Engine as a background daemon
sa engine stop          Stop the running Engine
sa engine status        Show Engine status
sa engine logs          Show recent Engine logs
sa engine restart       Restart the Engine
sa help                 Show help
```

## Skills

SA supports an extensible skill system based on the [agentskills.io](https://agentskills.io) spec. Skills are Markdown files (`SKILL.md`) that provide the agent with domain-specific instructions.

- **Local skills** live in `~/.sa/skills/<skill-name>/SKILL.md`
- **ClawHub** ([clawhub.ai](https://clawhub.ai)) is the public skill registry — the agent can search and install skills at runtime

## Documentation

- [Architecture](docs/architecture.md) — Engine, Connectors, and subsystem overview
- [Configuration](docs/configuration.md) — config files, env vars, secrets, model setup
- [Built-in tools](docs/tools.md) — what the agent can do
- [Development](docs/development.md) — scripts, testing, project structure

## Config location

Config lives in `~/.sa/` by default. Override with the `SA_HOME` environment variable.

```
~/.sa/
  IDENTITY.md      # agent name, personality, system prompt
  USER.md          # user profile (name, timezone, preferences)
  config.json      # runtime settings (active model, memory, telegram)
  models.json      # model configurations
  secrets.enc      # encrypted API keys and bot tokens
  memory/          # persistent memory entries
  skills/          # installed skills (one directory per skill)
  engine.url       # Engine discovery file (written at startup)
  engine.pid       # Engine PID file
  engine.token     # Engine auth token
  engine.log       # Engine log output
```
