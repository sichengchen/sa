# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Run the CLI directly (`src/cli/index.ts`) |
| `bun run build` | Bundle CLI to `dist/` (Bun target) |
| `bun test` | Run all tests (Bun's built-in runner) |
| `bun test src/engine/config/secrets.test.ts` | Run a single test file |
| `bun run lint` | ESLint across `src/` |
| `bun run typecheck` | TypeScript `tsc --noEmit` |

Runtime: **Bun** (not Node). Package manager: **Bun**. Module system: **ES modules**.

## Product Surface

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

## Architecture

Esperta Aria is a local-first agent platform. The runtime owns durable state, prompt assembly, tool execution, approvals, MCP integration, automation, and connector-facing interaction streams.

### Core subsystems

- `src/engine/runtime.ts` bootstraps the runtime and wires long-lived services together.
- `src/engine/operational-store.ts` is the SQLite operational store for sessions, messages, runs, tool calls, approvals, summaries, prompt cache, MCP availability, and automation records.
- `src/engine/prompt-engine.ts` assembles identity, safety policy, toolsets, memory, context files, active skills, and session overlays.
- `src/engine/toolsets.ts` and `src/engine/capability-policy.ts` define structured tool domains and policy metadata.
- `src/engine/mcp.ts` manages MCP servers and exposes their tools under the same runtime surface.
- `src/engine/automation.ts` and `src/engine/scheduler.ts` run heartbeat, cron, and webhook-triggered automation.
- `src/connectors/` contains the TUI and chat/webhook connector surfaces built on the shared interaction contract in `src/shared/types.ts`.

### Runtime home layout

`~/.aria/` contains the runtime database and operator-facing assets:

```
aria.db
config.json
secrets.enc
IDENTITY.md
USER.md
HEARTBEAT.md
memory/
skills/
engine.url
engine.pid
engine.token
engine.log
engine.heartbeat
```

### Working expectations

- Do not reintroduce `SA`, `Esperta Base`, `.sa`, or `.esper` into user-facing names, docs, or runtime guidance.
- Prefer durable state, structured toolsets, prompt-engine composition, and shared interaction contracts over legacy compatibility.
- When behavior changes, update the corresponding documentation in `docs/` as part of the same change.

### pi-ai type quirk

`getModel()` from pi-ai requires literal type parameters. When calling with dynamic strings, use the type assertion pattern:

```ts
(getModel as (p: string, m: string) => Model<Api>)(providerId, modelId)
```

## Testing

Tests use Bun's built-in test runner (Jest-compatible API — `describe`, `it`, `expect`). Test files:
- Unit tests co-located: `src/**/*.test.ts`
- Integration/E2E tests: `tests/`

## Documentation

- Canonical documentation lives in `docs/`.
- Start with `docs/README.md` and the product, system, and interface docs under `docs/product/`, `docs/system/`, and `docs/interfaces/`.
- `scripts/copy-docs.ts` copies the docs tree into the bundled `aria` skill before `scripts/embed-skills.ts` runs.

## ESLint

Uses ESLint 10+ flat config (`eslint.config.js`) with `@typescript-eslint/parser`. Only covers `src/**/*.ts` and `src/**/*.tsx`.
