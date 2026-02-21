# Development

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js is not required for runtime/test execution

## Setup

```bash
git clone <repo-url> sa
cd sa
bun install
cp .env.example .env
# fill at least one provider API key
```

## Scripts

Run scripts with `bun run <script>`.

| Script | Command | Description |
|---|---|---|
| `dev` | `bun run src/cli/index.ts` | Start Engine (if needed) and open TUI |
| `build` | `bun build src/cli/index.ts --outdir dist --target bun` | Build CLI bundle to `dist/` |
| `test` | `bun test` | Run all tests |
| `lint` | `eslint src/` | Lint source files |
| `typecheck` | `tsc --noEmit` | Run TypeScript checks |

## Running SA locally

If `sa` is not on your PATH, use `bun run src/cli/index.ts <command>`.

```bash
bun run dev           # start Engine + open TUI
sa config             # interactive config editor
sa onboard            # rerun onboarding wizard
sa engine status      # check daemon status
sa engine logs        # view recent daemon logs
sa engine stop        # stop daemon
```

## Tests

```bash
bun test
bun test src/engine/config/secrets.test.ts
bun test tests/integration/agent-flow.test.ts
```

## Project structure

```text
src/
  cli/                   # sa entrypoint, daemon command, onboarding/config UIs
    config/
    wizard/
  connectors/            # frontend transports
    tui/
    telegram/
    discord/
    shared/
  engine/                # daemon internals
    agent/
    audio/
    clawhub/
    config/
    memory/
    router/
    skills/
    tools/
    index.ts
    runtime.ts
    server.ts
    procedures.ts
  shared/                # shared tRPC client + shared types

tests/                   # integration/e2e/unit tests
```

## Key dependencies

| Package | Purpose |
|---|---|
| `@mariozechner/pi-ai` | Multi-provider LLM abstraction |
| `@trpc/server`, `@trpc/client` | Typed RPC between Engine and connectors |
| `grammy` | Telegram connector |
| `discord.js` | Discord connector |
| `ink`, `react` | Terminal UI |
| `ws` | WebSocket transport for subscriptions |
| `zod` | Runtime validation |
| `superjson` | tRPC serialization |
