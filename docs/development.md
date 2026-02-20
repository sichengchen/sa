# Development

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later (runtime, package manager, and test runner)
- Node.js is **not** required

## Setup

```bash
git clone <repo-url> sa
cd sa
bun install
cp .env.example .env
# Edit .env and fill in at least one provider API key
```

## Scripts

All scripts are run with `bun run <script>`.

| Script       | Command                                          | Description                          |
|--------------|--------------------------------------------------|--------------------------------------|
| `dev`        | `bun run src/engine/index.ts`                    | Run the Engine in the foreground (for development) |
| `cli`        | `bun run src/cli/index.ts`                       | Run the SA CLI directly              |
| `build`      | `bun build src/engine/index.ts --outdir dist --target bun` | Compile to `dist/` for distribution |
| `test`       | `bun test`                                       | Run all tests                        |
| `lint`       | `eslint src/`                                    | Lint the source directory            |
| `typecheck`  | `tsc --noEmit`                                   | Type-check without emitting files    |

## Running the Engine

For development, run the Engine in the foreground:

```bash
bun run dev
```

For production-like usage, use the CLI to manage the Engine as a background daemon:

```bash
sa engine start     # start daemon
sa engine status    # check if running
sa engine logs      # view recent output
sa engine stop      # graceful shutdown
```

Then start a connector in a separate terminal:

```bash
bun run src/connectors/tui/index.ts       # TUI
bun run src/connectors/telegram/index.ts   # Telegram
bun run src/connectors/discord/index.ts    # Discord
```

## Tests

Tests use `bun:test` and live alongside source files or in `tests/`:

```bash
bun test                                # run all tests
bun test src/config/secrets.test.ts     # run a single file
```

## Project structure

```
src/
  agent/          # Agent class, conversation loop, tool dispatch
  cli/            # SA CLI (sa engine start/stop/status/logs/restart)
  clawhub/        # ClawHub API client and skill installer
  config/         # ConfigManager, types, defaults, secrets
  connectors/
    tui/          # TUI Connector (Ink-based, connects to Engine)
    telegram/     # Telegram Connector (Grammy, connects to Engine)
    discord/      # Discord Connector (discord.js, connects to Engine)
  engine/         # Engine daemon: server, runtime, router, auth, sessions, scheduler
  memory/         # MemoryManager, persistence
  router/         # ModelRouter, ModelConfig types
  shared/         # Shared types, Connector interface, tRPC client factory
  skills/         # Skill loader, registry, prompt builder
  tools/          # read, write, edit, bash, remember, read_skill, clawhub_search
  wizard/         # Onboarding wizard components
```

## Key dependencies

| Package                  | Purpose                                   |
|--------------------------|-------------------------------------------|
| `@mariozechner/pi-ai`   | Unified multi-provider LLM API            |
| `@trpc/server` + `@trpc/client` | Typed RPC between Engine and Connectors |
| `grammy`                 | Telegram Bot API                          |
| `discord.js`             | Discord Bot API                           |
| `ink` + `react`          | Terminal UI framework                     |
| `ws`                     | WebSocket server for tRPC subscriptions   |
| `zod`                    | Schema validation                         |
| `superjson`              | tRPC serialisation (dates, Maps, etc.)    |

## Notes

This is a personal, single-user project. There is no contribution workflow, CI pipeline, or release process. The `main` branch reflects the stable state; features are developed on `feature/<phase>` branches.
