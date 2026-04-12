# Monorepo

Aria is implemented as a package-oriented monorepo.

## Packages

| Package | Owns |
| --- | --- |
| `packages/runtime` | compatibility-facing runtime shell and shared execution kernel |
| `packages/server` | server composition root, daemon lifecycle, discovery/brand helpers |
| `packages/projects` | tracked-work coordination and persistence APIs |
| `packages/workspaces` | repo and worktree services |
| `packages/jobs` | remote-job orchestration and backend selection |
| `packages/agents-coding` | coding-agent adapter contracts and concrete backend adapters |
| `packages/handoff` | idempotent submission into Projects |
| `packages/relay` | paired-device trust and queued remote control envelopes |
| `packages/console` | server-local console surface |
| `packages/connectors-im` | IM connector surfaces |
| `packages/connectors` | compatibility wrappers for older connector entrypoints |
| `packages/projects-engine` | compatibility re-exports for older tracked-work import paths |
| `packages/providers-*` | compatibility re-exports for older coding-agent adapter paths |
| `packages/cli` | operator CLI surface |

## System Model

```text
Surface or Connector
  -> Interaction Protocol
  -> Runtime

Projects / Workspaces / Jobs
  -> durable tracked work
  -> repo/worktree behavior
  -> dispatch records and execution routing

Relay
  -> paired-device trust
  -> attachment and envelope transport

Handoff
  -> local/runtime work submission into Projects
```

## Core Rule

One tracked dispatch creates one runtime execution.

## Practical State

The repo is now package-first. Most target-state packages are real owners on `new-aria`, while a smaller set of legacy packages remain only as compatibility layers.
