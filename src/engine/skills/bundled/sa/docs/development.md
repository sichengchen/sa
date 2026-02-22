# Development

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js is not required for runtime/test execution
- Git for version control and CalVer tagging
- A provider API key (Anthropic, OpenAI, Google, or OpenRouter) for live tests

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
| `build` | `bun run scripts/embed-skills.ts && bun build ...` | Embed bundled skills, then build CLI bundle to `dist/` |
| `test` | `bun test` | Run all tests (unit + integration, skips live without API key) |
| `lint` | `eslint src/` | Lint source files (ESLint 10+ flat config) |
| `typecheck` | `tsc --noEmit` | Run TypeScript type checks |
| `version:bump` | `bun run scripts/version.ts` | CalVer version bump + git tag |

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

scripts/
  version.ts             # CalVer bump (YYYY.M.patch)
  update-homebrew.ts     # Push formula to Homebrew tap
  embed-skills.ts        # Embed bundled skills into build

tests/
  helpers/               # shared test utilities
    temp-dir.ts          # withTempDir lifecycle helper
    live-model.ts        # makeLiveRouter, describeLive, LIVE flag
    test-tools.ts        # echo, fail, slow test tool stubs
    helpers.test.ts      # tests for the helpers themselves
  integration/           # multi-subsystem integration tests
  live/                  # live LLM tests (require ANTHROPIC_API_KEY)
  e2e/                   # end-to-end smoke tests
  *.test.ts              # subsystem-level tests (agent, auth, config, etc.)
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

## Testing strategy

SA uses Bun's built-in test runner, which provides a Jest-compatible API (`describe`, `test`, `expect`, `beforeEach`, `afterEach`). Tests are organized into three tiers.

### Unit tests (co-located)

Unit tests live alongside their source files with a `.test.ts` suffix. These test individual functions and modules in isolation.

```text
src/engine/config/secrets.test.ts
src/engine/tools/exec-classifier.test.ts
src/engine/tools/exec.test.ts
src/engine/tools/policy.test.ts
src/engine/tools/notify.test.ts
src/engine/agent/tool-loop-detection.test.ts
src/engine/agent/tool-result-guard.test.ts
src/engine/skills/prompt.test.ts
```

Run a single unit test:

```bash
bun test src/engine/config/secrets.test.ts
```

### Integration tests (`tests/` and `tests/integration/`)

Integration tests exercise multiple subsystems together. They use real (but temporary) file system state and mock or stub external dependencies.

```bash
bun test tests/integration/agent-flow.test.ts
bun test tests/integration/config-router.test.ts
bun test tests/integration/memory-persistence.test.ts
bun test tests/integration/tool-chain.test.ts
```

Top-level files in `tests/` (e.g., `tests/agent.test.ts`, `tests/sessions.test.ts`, `tests/tools.test.ts`) are subsystem-level tests that verify engine components against realistic configurations.

### Live LLM tests (`tests/live/`)

Live tests make real API calls to an LLM provider. They are gated behind the `ANTHROPIC_API_KEY` environment variable and skip gracefully when it is absent.

```bash
# Run live tests (requires API key)
ANTHROPIC_API_KEY=sk-... bun test tests/live/

# They also run as part of `bun test` but skip without the key
bun test
```

Live test files:

- `tests/live/agent-chat.test.ts` -- single-turn, multi-turn, tool use, streaming order, approval callbacks
- `tests/live/procedures.test.ts` -- full tRPC procedure round-trips with a real model

## Test helpers

All test helpers live in `tests/helpers/` and are themselves tested in `tests/helpers/helpers.test.ts`.

### `withTempDir(fn)` -- temporary directory lifecycle

Creates a unique temp directory before each test and removes it after. Prevents test pollution and avoids touching the real `~/.sa/` directory.

```ts
import { withTempDir } from "../helpers/temp-dir.js";

describe("MyFeature", () => {
  withTempDir((getDir) => {
    test("writes config", async () => {
      const dir = getDir(); // unique per test
      // use dir as SA_HOME or working directory
    });
  });
});
```

### `makeLiveRouter()` -- cheap live model router

Returns a `ModelRouter` configured for `claude-3-5-haiku` with `temperature: 0` and `maxTokens: 128`. Designed for deterministic, low-cost live testing. Throws a clear error if `ANTHROPIC_API_KEY` is not set.

```ts
import { makeLiveRouter } from "../helpers/live-model.js";

const router = makeLiveRouter();
const agent = new Agent({ router, tools: [], systemPrompt: "Reply briefly." });
```

### `describeLive` -- conditional describe

A wrapper around `describe.if(LIVE)` that skips the entire block when `ANTHROPIC_API_KEY` is absent. Use this to gate any test suite that makes real API calls.

```ts
import { describeLive } from "../helpers/live-model.js";

describeLive("feature X with real LLM", () => {
  test("does something", async () => { /* ... */ });
});
```

### Test tools (`echoTool`, `failTool`, `slowTool`)

Three minimal `ToolImpl` stubs for testing tool dispatch without side effects:

| Tool | Behavior | Use case |
|---|---|---|
| `echoTool` | Returns `{ content: args.message }` | Verify tool round-trips |
| `failTool` | Throws `Error(args.reason)` | Test error handling paths |
| `slowTool` | Waits `args.ms` milliseconds, then returns | Test timeouts and cancellation |

All three have `dangerLevel: "safe"` so they never trigger approval flows.

## CI/CD pipeline

### GitHub Actions -- CI (`ci.yml`)

Runs on every push and pull request to `main`. Two jobs run in parallel:

1. **`secret-scan`** -- Uses [TruffleHog](https://github.com/trufflesecurity/trufflehog) with `--only-verified --fail` to detect leaked secrets. Checks the full git history (`fetch-depth: 0`).

2. **`check`** -- Runs lint, typecheck, test, and build sequentially:
   ```
   bun install -> bun run lint -> bun run typecheck -> bun test -> bun run build
   ```
   On `main`, the build artifact is uploaded for use by downstream workflows.

Live LLM tests in `tests/live/` skip in CI because `ANTHROPIC_API_KEY` is not injected into the CI environment. This is intentional -- CI validates correctness of non-LLM logic only.

### GitHub Actions -- Release (`release.yml`)

Triggered by pushing a version tag (`v*`). Three sequential jobs:

1. **`build`** -- Builds on `macos-latest`, produces `sa-darwin` binary and SHA-256 checksum.
2. **`release`** -- Creates a GitHub Release with auto-generated release notes and attaches the binary + checksum.
3. **`update-tap`** -- Runs `scripts/update-homebrew.ts` to push an updated Homebrew formula to the tap repository (`sichengchen/homebrew-tap`).

### CalVer versioning

SA uses Calendar Versioning with the format `YYYY.M.patch`:

- `YYYY` -- full year (e.g., `2026`)
- `M` -- month, no zero-padding (e.g., `2` for February)
- `patch` -- incremental within the month, starting at `0`

Bump the version:

```bash
bun run version:bump              # bump + create git tag
bun run scripts/version.ts --push # bump + tag + push (triggers release)
```

The script (`scripts/version.ts`) reads the current version from `package.json`, computes the next version, writes it back, commits, and creates a git tag. If the month has changed since the last release, the patch resets to `0`.

### Homebrew tap distribution

After a release, `scripts/update-homebrew.ts` pushes an updated formula to `sichengchen/homebrew-tap` via the GitHub Contents API. The formula installs `sa-darwin` into the Homebrew bin and registers a `brew services` launchd entry for the engine daemon.

Users install with:

```bash
brew tap sichengchen/tap
brew install sa
brew services start sa  # optional: run engine as a background service
```

## Path aliases

The project uses TypeScript path aliases to avoid deep relative imports. These are configured in `tsconfig.json` and resolved by Bun at runtime.

| Alias | Maps to |
|---|---|
| `@sa/engine/*` | `src/engine/*` |
| `@sa/connectors/*` | `src/connectors/*` |
| `@sa/shared/*` | `src/shared/*` |
| `@sa/cli/*` | `src/cli/*` |

Use path aliases in all new code:

```ts
// Correct
import { ConfigManager } from "@sa/engine/config/index.js";
import type { EngineEvent } from "@sa/shared/types.js";

// Avoid
import { ConfigManager } from "../../../engine/config/index.js";
```

Always include the `.js` extension in import paths -- this is required by the ES module system even though the source files are `.ts`.

## Contributing guidelines

1. **Read before you modify.** Understand the module you are changing and its callers before making edits.
2. **Follow existing patterns.** Match the style and conventions of surrounding code. If a subsystem uses `withTempDir` in tests, do the same.
3. **Use Bun, not npm.** All commands use `bun` -- `bun install`, `bun test`, `bun run build`. Do not use `npm` or `yarn`.
4. **Use path aliases.** Import with `@sa/engine/*`, `@sa/shared/*`, etc. Do not introduce new deep relative imports.
5. **Co-locate unit tests.** Place unit tests next to the source file they test, with a `.test.ts` suffix.
6. **Gate live tests.** Any test that calls a real LLM must use `describeLive` and `makeLiveRouter`. Never let a test fail simply because an API key is absent.
7. **Run the full check suite before submitting.**
   ```bash
   bun run lint && bun run typecheck && bun test && bun run build
   ```
8. **Do not commit secrets.** The CI pipeline runs TruffleHog to catch leaked credentials. Use environment variables and `secrets.enc` for sensitive values.

## Debugging tips

### Isolated testing with `SA_HOME`

Override the config directory to avoid touching your real `~/.sa/` state:

```bash
SA_HOME=/tmp/sa-debug bun run dev
```

This is particularly useful when testing config migration, onboarding flows, or memory persistence. The `withTempDir` helper does this automatically in tests.

### Engine daemon logs

When the engine runs as a daemon, its stdout/stderr is written to `~/.sa/engine.log` (or `$SA_HOME/engine.log`).

```bash
sa engine logs          # view recent log output
tail -f ~/.sa/engine.log  # stream logs in real time
```

Common things to look for:
- tRPC procedure errors
- Tool execution failures
- Model router initialization issues
- Scheduler/heartbeat errors

### Running a single test file

Bun supports running individual test files directly:

```bash
bun test src/engine/tools/exec.test.ts
bun test tests/live/agent-chat.test.ts
```

To run tests matching a pattern:

```bash
bun test --grep "tool dispatch"
```

### TypeScript and lint checks

Run these independently to isolate issues:

```bash
bun run typecheck   # type errors only
bun run lint        # style/lint errors only
```

### Inspecting tRPC procedures

The engine exposes tRPC on `127.0.0.1:7420` (HTTP) and `127.0.0.1:7421` (WebSocket). You can curl the HTTP endpoint for debugging:

```bash
# Check if engine is running
curl -s http://127.0.0.1:7420/health

# The engine.url file contains the active URL
cat ~/.sa/engine.url
```

### pi-ai type assertion

When working with dynamic provider/model strings, the `getModel()` function from pi-ai requires literal type parameters. Use the type assertion pattern:

```ts
(getModel as (p: string, m: string) => Model<Api>)(providerId, modelId)
```

This is a known quirk documented in `CLAUDE.md` and affects any code that resolves models dynamically at runtime.
