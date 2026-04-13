# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

| Command                                | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `bun run dev`                          | Run the CLI directly (`packages/cli/src/index.ts`) |
| `bun run build`                        | Run the cached repo build task via `vp run`        |
| `bun run test`                         | Run the cached repo test task via `vp run`         |
| `bun run test -- tests/skills.test.ts` | Run a single test file                             |
| `bun run check`                        | Run the cached repo check task via `vp run`        |
| `bun run verify`                       | Run repo check, test, and build in order           |
| `bun run typecheck`                    | TypeScript `tsc --noEmit`                          |

Runtime: **Bun** (not Node). Package manager: **Bun**. Module system: **ES modules**.

## Product Surface

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

## Architecture

Esperta Aria is a local-first agent platform. The runtime owns durable state, prompt assembly, tool execution, approvals, MCP integration, automation, and connector-facing interaction streams.

### Core subsystems

- `packages/runtime/src/runtime.ts` bootstraps the runtime and wires long-lived services together.
- `packages/runtime/src/operational-store.ts` is the SQLite operational store for sessions, messages, runs, tool calls, approvals, summaries, prompt cache, MCP availability, and automation records.
- `packages/runtime/src/prompt-engine.ts` assembles identity, safety policy, toolsets, memory, context files, active skills, and session overlays.
- `packages/runtime/src/toolsets.ts` and `packages/runtime/src/capability-policy.ts` define structured tool domains and policy metadata.
- `packages/runtime/src/mcp.ts` manages MCP servers and exposes their tools under the same runtime surface.
- `packages/runtime/src/automation.ts` and `packages/runtime/src/scheduler.ts` run heartbeat, cron, and webhook-triggered automation.
- `packages/connectors/src/` contains the TUI and chat/webhook connector surfaces built on the shared interaction contract in `packages/shared-types/src/types.ts`.

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
(getModel as (p: string, m: string) => Model<Api>)(providerId, modelId);
```

## Testing

Tests run through `Vitest` using the shared `vite.config.ts` configuration, but execute under Bun because the repo imports `bun` and `bun:sqlite`. The suite keeps a `bun:test` compatibility shim so existing Jest-style test imports continue to work while the repo uses the Vitest runtime. Test files:

- Unit tests co-located: `packages/**/*.test.ts`
- Integration/E2E tests: `tests/`

## Documentation

- Canonical documentation lives in `docs/`.
- Start with `docs/README.md`, then use the new reader-oriented sections under `docs/product/`, `docs/architecture/`, `docs/operator/`, `docs/security/`, `docs/reference/`, and `docs/development/`.
- `scripts/copy-docs.ts` copies the docs tree into the bundled `aria` skill before `scripts/embed-skills.ts` runs.

## Checks

Static checks run through `Vite+` in `vite.config.ts`:

- `vp fmt` / `bun run fmt` for formatting via `Oxfmt`
- `vp lint` / `bun run lint` for linting via `Oxlint`
- `vp run repo:check` / `bun run check` for the repo-level cached format, lint, and TypeScript check flow
