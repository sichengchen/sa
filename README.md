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
- `packages/relay` owns paired-device trust, session attachment, and queued remote-control envelopes
- `packages/console` and `packages/connectors-im` own the console and IM connector surfaces

Legacy compatibility surfaces such as `@aria/runtime` and `packages/connectors` still remain, but the old tracked-work, shared-types, and provider wrapper packages have been removed.

One tracked dispatch creates one runtime execution.

## Public Identity

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

## Quick Start

```bash
bun install
bun run dev
```

On first run, Aria writes operator state under `~/.aria/` and opens the onboarding flow if needed.

## CLI

Core commands:

- `aria`
- `aria onboard`
- `aria config`
- `aria automation`
- `aria audit`
- `aria memory`
- `aria projects`
- `aria relay`
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
  connectors/
  connectors-im/
  console/
  gateway/
  handoff/
  jobs/
  memory/
  mobile/
  policy/
  projects/
  prompt/
  relay/
  runtime/
  server/
  store/
  tools/
  ui/
  workspaces/
apps/
  aria-server/
  aria-desktop/
  aria-mobile/
services/
  aria-relay/
scripts/             build, embedding, migration, release helpers
tests/               unit, integration, workflow, and live-gated tests
```

## Development

Primary checks:

```bash
bun run typecheck
bun test
bun run build
```

## Documentation

Canonical docs live under [docs](./docs).

Recommended entry points:

- [docs/README.md](./docs/README.md)
- [docs/product/overview.md](./docs/product/overview.md)
- [docs/architecture/runtime.md](./docs/architecture/runtime.md)
- [docs/new-architecture/server.md](./docs/new-architecture/server.md)
- [docs/development/phase-9-architecture-truth-table.md](./docs/development/phase-9-architecture-truth-table.md)
- [docs/architecture/relay.md](./docs/architecture/relay.md)
- [docs/operator/getting-started.md](./docs/operator/getting-started.md)
