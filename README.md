# Esperta Aria

Esperta Aria is a local-first agent platform built around one durable runtime, one shared interaction protocol, and one monorepo.

## Product Areas

- `Aria Local`: run and supervise agent work on your own machine
- `Aria Remote`: control active work from paired devices
- `Aria Automations`: run scheduled and webhook-triggered tasks on the same runtime substrate
- `Aria Projects`: track durable work, dispatch agent runs, manage repos/worktrees, and handle review/publish flow

## Core Architecture

- `packages/runtime` is the compatibility-facing runtime shell over target-owned memory, automation, prompt, tools, policy, audit, store, and gateway surfaces
- `packages/projects`, `packages/workspaces`, and `packages/jobs` own tracked-work coordination, repo/worktree behavior, and remote-job orchestration
- `packages/agents-coding` owns shared coding-agent adapter contracts and concrete backend adapters
- `packages/server` owns the server composition root and daemon/discovery lifecycle helpers
- `packages/handoff` turns local or runtime-originated work into tracked project work through idempotent submissions
- `packages/console` and `packages/connectors-im` own the console and IM connector surfaces

Legacy compatibility surfaces such as `@aria/runtime` still remain, but the old tracked-work, shared-types, provider, and connector wrapper packages have been removed.

One tracked dispatch creates one runtime execution.

## Public Identity

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

## Quick Start

```bash
bun install
bun run dev:server
```

On first run, Aria writes operator state under `~/.aria/` and opens the onboarding flow if needed.
That flow can configure provider presets such as Anthropic, OpenAI, Google, OpenRouter, and MiniMax.

## CLI

Core commands:

- `aria`
- `aria onboard`
- `aria config`
- `aria automation`
- `aria audit`
- `aria memory`
- `aria projects`
- `aria gateway`
- `aria engine start|stop|status|logs`
- `aria stop`
- `aria restart`
- `aria shutdown`

Connector and integration surfaces:

- `aria telegram`
- `aria discord`
- `aria slack`
- `aria teams`
- `aria gchat`
- `aria github`
- `aria linear`
- `aria wechat`

Configured connectors now auto-start with `Aria Server` when their credentials are present.
The connector commands remain available for standalone/debug runs.

`aria slack` supports either webhook mode (`aria slack [port]`) or Slack Socket Mode
(`aria slack socket`) when `SLACK_APP_TOKEN` is configured.

## Repo Layout

```text
docs/                canonical documentation tree
packages/
  access-client/
  agent-aria/
  agents-coding/
  audit/
  automation/
  cli/
  connectors-im/
  console/
  gateway/
  handoff/
  jobs/
  memory/
  policy/
  projects/
  prompt/
  runtime/
  server/
  store/
  tools/
  ui/
  workspaces/
apps/
  aria-server/
  aria-desktop/
scripts/             build, embedding, migration, release helpers
tests/               unit, integration, workflow, and live-gated tests
```

## Development

Primary checks:

```bash
vp run repo:check
vp run repo:test
vp run repo:build
vp run repo:verify
```

Convenience wrappers are also available:

```bash
bun run dev:server
bun run dev:desktop
bun run check
bun run test
bun run build
bun run verify
```

## Documentation

Canonical docs live under [docs](./docs).

Recommended entry points:

- [docs/README.md](./docs/README.md)
- [docs/product/overview.md](./docs/product/overview.md)
- [docs/architecture/core/overview.md](./docs/architecture/core/overview.md)
- [docs/architecture/surfaces/server.md](./docs/architecture/surfaces/server.md)
- [docs/architecture/core/packages.md](./docs/architecture/core/packages.md)
- [docs/architecture/surfaces/gateway-access.md](./docs/architecture/surfaces/gateway-access.md)
- [docs/operator/core/getting-started.md](./docs/operator/core/getting-started.md)
