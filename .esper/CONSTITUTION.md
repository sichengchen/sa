# Esperta Base Constitution

## Project Identity

**Esperta Base** is a personal AI agent assistant. It runs as a local daemon (Engine) that exposes a tRPC API, allowing multiple connectors — TUI, Telegram, Slack, Teams, Discord, Google Chat, GitHub, Linear, and webhooks — to interact with AI models through a unified interface.

Esperta Base gives technical enthusiasts a self-hosted, privacy-respecting AI assistant that lives across their communication channels.

## What Esperta Base Is Not

- **Not a hosted SaaS** — Esperta Base runs locally on the user's machine. There is no multi-tenant cloud service.
- **Not a framework or library** — Esperta Base is an end-user product. Others do not build on top of it.
- **Not an AI model** — Esperta Base orchestrates models (Anthropic, OpenAI, Google, OpenRouter, etc.) via pi-ai. It does not train or serve models.

## Users

Technical enthusiasts who want a self-hosted AI agent they can reach from their terminal, chat platforms, and automation workflows.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Runtime | Bun |
| Package manager | Bun |
| Module system | ES modules |
| RPC | tRPC (HTTP + WebSocket) |
| TUI | Ink (React) |
| Model routing | pi-ai (`@mariozechner/pi-ai`) |
| Telegram | Grammy |
| Chat platforms | Chat SDK (custom adapter) |
| Testing | Bun built-in runner (Jest-compatible API) |
| Linting | ESLint 10+ flat config |

## Coding Standards

- **Naming**: camelCase for variables/functions, PascalCase for types/classes, UPPER_SNAKE for constants.
- **File structure**: co-locate tests (`*.test.ts`) alongside source files. Integration tests live in `tests/`.
- **Imports**: ES module syntax only. No CommonJS.
- **Error handling**: throw typed errors; avoid silent swallows. Validate at system boundaries (user input, external APIs).
- **Patterns**: Engine owns all state; connectors are stateless. One Agent per session. Streaming via `EngineEvent` yields.

## Testing Strategy

- **Unit tests**: co-located `*.test.ts` files using Bun's built-in runner (`describe`, `it`, `expect`).
- **Integration tests**: `tests/` directory for cross-module and E2E scenarios.
- **Commands**: `bun test` (all), `bun test <path>` (single file).
- **What gets tested**: core engine logic, tool dispatch, config parsing, model routing, security boundaries.

## Scope Boundaries

These will **never** be built in Esperta Base:

- Multi-tenant hosting or user account management
- Model training, fine-tuning, or serving
- A public-facing API for third-party developers
- Mobile native apps (connectors use existing chat platforms instead)
- Billing, payments, or subscription management
