# SA (Sasa)

Yet another personal AI assistant.

## Install

```bash
brew install sichengchen/tap/sa
```

Requires [Bun](https://bun.sh). Update with `brew upgrade sa`.

## Architecture

The **Engine** runs as a background daemon and owns the agent loop, tools, memory, skills, scheduler, audio transcription, and model routing. **Connectors** (Telegram, Discord) auto-start with the Engine when configured. The **TUI** is launched on-demand. A **Webhook** endpoint (`POST /webhook`) allows external systems to send messages programmatically.

## Development

```bash
git clone https://github.com/sichengchen/sa.git
cd sa
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

## SA CLI

```text
sa                      Start Engine (if needed) and open the TUI
sa onboard              Run the onboarding wizard
sa config               Open interactive config editor (providers/models/connectors/memory)
sa engine start         Start the Engine as a background daemon
sa engine stop          Stop the running Engine
sa engine status        Show Engine status
sa engine logs          Show recent Engine logs
sa engine restart       Restart the Engine
sa help                 Show help
```

## Skills

- Bundled skills ship in `src/engine/skills/bundled/`
- User-installed/local skills live in `~/.sa/skills/<skill-name>/SKILL.md`

## Documentation

- [Architecture](docs/architecture.md) — Engine, connectors, runtime flow, tRPC surface
- [Configuration](docs/configuration.md) — config schema, env vars, secrets, file layout
- [Built-in tools](docs/tools.md) — tool names, parameters, and behavior
- [Development](docs/development.md) — scripts, testing, and project structure

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
  engine.url        # Engine discovery file (written at startup)
  engine.pid        # Engine PID file
  engine.token      # Engine auth token file
  engine.log        # Engine log output
  engine.heartbeat  # heartbeat metadata written by scheduler
```
