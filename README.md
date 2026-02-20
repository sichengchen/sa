# SA (Sasa)

A personal AI agent assistant for myself.

## Architecture

SA uses a daemon + connector architecture. The **Engine** runs as a background daemon exposing a tRPC API over HTTP and WebSocket. **Connectors** (TUI, Telegram, Discord) connect to the Engine and relay messages between the user and the agent.

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│   TUI    │   │ Telegram │   │ Discord  │
│Connector │   │Connector │   │Connector │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    │ tRPC (HTTP + WS)
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
```

On first run, a setup wizard walks you through identity, model configuration, and optional Telegram/Discord setup. Config is saved to `~/.sa/`.

Start the Engine daemon, then connect with any frontend:

```bash
# Start the Engine
sa engine start

# In another terminal — run the TUI connector
bun run src/connectors/tui/index.ts

# Or start the Telegram connector
bun run src/connectors/telegram/index.ts
```

For development, run the Engine in the foreground:

```bash
bun run dev
```

## SA CLI

The `sa` command manages the Engine daemon.

```
sa engine start     Start the Engine as a background daemon
sa engine stop      Stop the running Engine
sa engine status    Show Engine status
sa engine logs      Show recent Engine logs
sa engine restart   Restart the Engine
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
  engine.token     # Engine auth token (local connectors)
  engine.log       # Engine log output
```
