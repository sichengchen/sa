# SA (Sasa)

A personal AI agent assistant for myself.

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- API key for at least one LLM provider (Anthropic, OpenAI, or Google)
- Optional: a Telegram bot token for the Telegram interface

## Quickstart

```bash
git clone <repo-url> sa
cd sa
bun install
cp .env.example .env   # fill in your API keys
bun run dev
```

On first run, a setup wizard walks you through identity, model configuration, and optional Telegram setup. Config is saved to `~/.sa/` and the wizard won't run again unless you pass `--setup`.

## CLI flags

| Flag              | Effect                                      |
|-------------------|---------------------------------------------|
| `--setup`         | Force re-run the onboarding wizard          |
| `--telegram-only` | Start bot only, skip the terminal UI        |

## Documentation

- [Configuration](docs/configuration.md) — config files, env vars, model setup
- [Built-in tools](docs/tools.md) — what the agent can do (Read, Write, Edit, Bash, Remember)
- [Architecture](docs/architecture.md) — subsystem overview and data flow
- [Development](docs/development.md) — scripts, testing, contributing

## Config location

Config lives in `~/.sa/` by default. Override with the `SA_HOME` environment variable.

```
~/.sa/
  identity.md    # agent name, personality, system prompt
  config.json    # runtime settings (active model, memory, telegram)
  models.json    # model configurations
  memory/        # persistent memory entries
```
