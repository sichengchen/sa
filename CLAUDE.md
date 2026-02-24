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

SA is a personal AI agent assistant. It runs as a **daemon (Engine)** that connectors talk to over **tRPC** (HTTP + WebSocket on `127.0.0.1:7420/7421`).

```
CLI (`src/cli/`)
  ├─ sa              → detect first run → wizard or TUI
  ├─ sa engine       → start / stop / status / logs / restart
  ├─ sa config       → interactive config editor
  └─ sa onboard      → onboarding wizard

Connectors (`src/connectors/`)      Engine (`src/engine/`)
  ├─ tui/   (Ink + React)           ├─ runtime.ts     — bootstrap all subsystems
  ├─ telegram/ (Grammy)      ←tRPC→ ├─ server.ts      — HTTP + WS server
  └─ discord/  (Discord.js)         ├─ procedures.ts  — tRPC API surface
                                    ├─ agent/         — chat loop + tool dispatch
                                    ├─ router/        — model switching (pi-ai)
                                    ├─ config/        — file-based config + secrets
                                    ├─ memory/        — persistent memory files
                                    ├─ skills/        — skill discovery + loading
                                    ├─ tools/         — 9 built-in tools
                                    ├─ sessions.ts    — per-connector sessions
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
- **Streaming events** — the agent yields `EngineEvent` types: `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `tool_approval_request`, `done`, `error`.
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

System docs live in `specs/` — the single source of truth. At build time, `scripts/copy-specs.ts` copies them into the SA bundled skill for embedding in the binary. See `specs/README.md` for the full index.

## ESLint

Uses ESLint 10+ flat config (`eslint.config.js`) with `@typescript-eslint/parser`. Only covers `src/**/*.ts` and `src/**/*.tsx`.
