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

## Architecture

Esperta Base is a personal AI agent assistant. It runs as a **daemon (Engine)** that connectors talk to over **tRPC** (HTTP + WebSocket on `127.0.0.1:7420/7421`).

```
CLI (`src/cli/`)
  ├─ esperta-base              → detect first run → wizard or TUI
  ├─ esperta-base engine       → start / stop / status / logs / restart
  ├─ esperta-base config       → interactive config editor
  └─ esperta-base onboard      → onboarding wizard

Connectors (`src/connectors/`)      Engine (`src/engine/`)
  ├─ tui/      (Ink + React)         ├─ runtime.ts     — bootstrap all subsystems
  ├─ telegram/ (Grammy)       ←tRPC→ ├─ server.ts      — HTTP + WS server
  ├─ chat-sdk/ (shared adapter)      ├─ procedures.ts  — tRPC API surface
  │   ├─ slack/                      ├─ agent/         — chat loop + tool dispatch
  │   ├─ teams/                      ├─ router/        — model switching (pi-ai)
  │   ├─ gchat/                      ├─ config/        — file-based config + secrets
  │   ├─ discord/                    ├─ memory/        — persistent memory files
  │   ├─ github/                     ├─ skills/        — skill discovery + loading
  │   └─ linear/                     ├─ tools/         — 22 built-in tools
  └─ webhook/                        ├─ sessions.ts    — per-connector sessions
                                     ├─ auth.ts        — token management
                                     └─ scheduler.ts   — heartbeat task

Shared (`src/shared/`)
  ├─ types.ts       — EngineEvent, Session, ConnectorType
  ├─ client.ts      — typed tRPC client factory
  ├─ connector.ts   — connector base
  └─ markdown.ts    — markdown formatting
```

### Key design decisions

- **Engine owns all state** — config, model router, memory, skills, tools. Connectors are stateless frontends.
- **File-based config** at `~/.sa/` (overridable via `SA_HOME`) — no database. Secrets are encrypted in `secrets.enc`.
- **One Agent per session** — `SessionManager` maps `sessionId → Agent`. Each agent holds its own message history.
- **Streaming events** — the agent yields `EngineEvent` types: `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `tool_approval_request`, `user_question`, `reaction`, `done`, `error`.
- **Model routing** via `@mariozechner/pi-ai` — supports Anthropic, OpenAI, Google, OpenRouter, etc. The `ModelRouter` wraps pi-ai's `getModel()` and persists state to `config.json`.
- **Skills** use the agentskills.io Markdown spec. Bundled skills live in `src/engine/skills/bundled/`, user-installed in `~/.sa/skills/`.

### pi-ai type quirk

`getModel()` from pi-ai requires literal type parameters. When calling with dynamic strings, use the type assertion pattern:

```ts
(getModel as (p: string, m: string) => Model<Api>)(providerId, modelId)
```

## Testing

Tests use Bun's built-in test runner (Jest-compatible API — `describe`, `it`, `expect`). Test files:
- Unit tests co-located: `src/**/*.test.ts`
- Integration/E2E tests: `tests/`

## Config directory layout (`~/.sa/`)

```
IDENTITY.md, USER.md, config.json, secrets.enc, .salt
memory/, skills/
engine.url, engine.pid, engine.token, engine.log, engine.heartbeat
```

## Documentation

System docs live in `specs/` — the single source of truth. At build time, `scripts/copy-specs.ts` copies them into the bundled `sa` compatibility skill for embedding in the binary. See `specs/README.md` for the full index.

## ESLint

Uses ESLint 10+ flat config (`eslint.config.js`) with `@typescript-eslint/parser`. Only covers `src/**/*.ts` and `src/**/*.tsx`.

## EsperKit

Keep project-specific instructions outside this section. The `esper:init` workflow may update only this block.

### Required Reads

1. Read `.esper/context.json` for machine-readable project state.
2. Read `.esper/CONSTITUTION.md` for project scope and constraints.
3. Read `.esper/WORKFLOW.md` for the canonical Esper workflow.
4. If `active_increment` is set, read the matching file under `.esper/increments/active/`.
5. Read the relevant spec files under the configured `spec_root` from `.esper/context.json`.

### Source of Truth

- `.esper/context.json` is the runtime context shared across tools.
- `.esper/WORKFLOW.md` defines the operational workflow.
- The configured `spec_root` is the authoritative spec tree.

### Verification

- Read the `commands` object in `.esper/context.json` for the exact test, lint, typecheck, and dev commands.
- Run the configured commands before closing an increment.
