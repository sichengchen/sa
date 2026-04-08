# Development

## Prerequisites

- [Bun](https://bun.sh) v1.0+ (runtime, package manager, test runner)
- Git for version control and CalVer tagging
- A provider API key (Anthropic, OpenAI, Google, or OpenRouter) for live tests

---

## Setup

```bash
git clone <repo-url> aria && cd aria
bun install
cp .env.example .env   # fill at least one provider API key
```

---

## Scripts

| Script         | Description                                      |
|----------------|--------------------------------------------------|
| `dev`          | Start Engine (if needed) and open TUI            |
| `build`        | Embed bundled skills, then build CLI to `dist/`  |
| `test`         | Run all tests (skips live without API key)       |
| `lint`         | ESLint across `src/` (flat config)               |
| `typecheck`    | `tsc --noEmit`                                   |
| `version:bump` | CalVer version bump + git tag                    |

---

## Project Structure

```
src/
  cli/              # entrypoint, daemon commands, onboarding/config UIs
  connectors/       # transports: tui, telegram, discord
  engine/           # daemon: agent, config, memory, router, skills, tools
  shared/           # tRPC client, shared types, markdown utils
scripts/            # version.ts, update-homebrew.ts, embed-skills.ts
tests/
  helpers/          # withTempDir, makeLiveRouter, test tool stubs
  integration/      # multi-subsystem tests
  live/             # live LLM tests (require API key)
```

---

## Key Dependencies

| Package                        | Purpose                            |
|--------------------------------|------------------------------------|
| `@mariozechner/pi-ai`         | Multi-provider LLM abstraction     |
| `@trpc/server`, `@trpc/client`| Typed RPC (Engine <-> connectors)  |
| `grammy`                       | Telegram connector                 |
| `discord.js`                   | Discord connector                  |
| `ink`, `react`                 | Terminal UI                        |
| `zod`                          | Runtime validation                 |

---

## Testing

Three tiers, all using Bun's built-in test runner (Jest-compatible API).

**Unit tests** -- co-located with source as `.test.ts` files. Run: `bun test src/engine/tools/exec.test.ts`

**Integration tests** (`tests/integration/`) -- exercise multiple subsystems with temp directories and mocked externals.

**Live LLM tests** (`tests/live/`) -- real API calls, gated behind `ANTHROPIC_API_KEY`. Skip gracefully when absent.

### Test Helpers (`tests/helpers/`)

| Helper             | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `withTempDir(fn)`  | Unique temp directory per test, auto-cleaned                   |
| `makeLiveRouter()` | `ModelRouter` for haiku, `temperature: 0`, `maxTokens: 128`   |
| `describeLive`     | `describe.if(LIVE)` -- skips block when no API key             |
| `echoTool`         | Returns `{ content: args.message }` (safe, no side effects)   |
| `failTool`         | Throws `Error(args.reason)` for error-path testing             |
| `slowTool`         | Waits `args.ms` ms for timeout/cancellation testing            |

---

## CI/CD

**CI** (`ci.yml`) -- runs on push/PR to `main`: TruffleHog secret scan + lint + typecheck + test + build.

**Release** (`release.yml`) -- triggered by `v*` tag: build `aria-darwin` binary, create GitHub Release, update Homebrew tap.

---

## CalVer

Format: `YYYY.M.patch` (e.g., `2026.2.0`). Patch resets to `0` on month change.

```bash
bun run version:bump              # bump + tag
bun run scripts/version.ts --push # bump + tag + push (triggers release)
```

---

## Homebrew Tap

```bash
brew tap sichengchen/tap && brew install aria
brew services start aria   # optional: engine as background service
```

---

## Path Aliases

| Alias              | Maps To            |
|--------------------|--------------------|
| `@aria/engine/*`     | `src/engine/*`     |
| `@aria/connectors/*` | `src/connectors/*` |
| `@aria/shared/*`     | `src/shared/*`     |
| `@aria/cli/*`        | `src/cli/*`        |

Configured in `tsconfig.json`, resolved by Bun. Always include `.js` extension in imports.

---

## Contributing

1. Understand the module and its callers before editing.
2. Follow existing patterns. Use Bun, not npm.
3. Use path aliases -- no deep relative imports.
4. Co-locate unit tests (`.test.ts`). Gate live tests with `describeLive`.
5. Full check before submitting: `bun run lint && bun run typecheck && bun test && bun run build`
6. Do not commit secrets (TruffleHog CI enforces this).

---

## Debugging

- **ARIA_HOME override**: `ARIA_HOME=/tmp/aria-debug bun run dev` for isolated testing.
- **Engine logs**: `aria engine logs` or `tail -f ~/.aria/engine.log`.
- **Single test**: `bun test src/engine/tools/exec.test.ts` or `bun test --grep "pattern"`.
