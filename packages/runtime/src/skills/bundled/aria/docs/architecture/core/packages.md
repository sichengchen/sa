# Package And Naming Model

This page defines the package names, top-level repo layout, and naming rules for the canonical architecture.

## Naming Rules

### Public product names

- `Aria Server`
- `Aria Node`
- `Aria Agent`
- `Aria Desktop`
- `Aria Mobile`
- `Aria Console`

### Internal package scope

Use `@aria/*`.

### Reserved terms

| Term        | Use it for                                         | Do not use it for                              |
| ----------- | -------------------------------------------------- | ---------------------------------------------- |
| `agent`     | LLM-based assistants such as `Aria Agent`          | generic services, daemons, or backend adapters |
| `runtime`   | the shared runtime kernel                          | the deployed server product                    |
| `server`    | the deployable server app                          | the runtime kernel                             |
| `gateway`   | built-in authenticated API and realtime entrypoint | generic reverse proxies or tunnels             |
| `connector` | IM/chat integrations                               | generic client integrations                    |
| `bridge`    | desktop-local execution integration                | server-side services                           |
| `workspace` | execution boundary                                 | a casual synonym for repo or folder            |

### Renames from older language

| Older term             | New term                                              |
| ---------------------- | ----------------------------------------------------- |
| `engine`               | `runtime`                                             |
| `TUI connector`        | `Aria Console`                                        |
| generic `connectors`   | `IM connectors` when referring to Slack/Telegram/etc. |
| top-level `session` UX | `thread`                                              |

## Proposed Repo Layout

```text
apps/
  aria-server/
  aria-desktop/

packages/
  access-client/
  agent/
  audit/
  automation/
  cli/
  connectors/
  console/
  gateway/
  handoff/
  jobs/
  memory/
  persistence/
  policy/
  prompt/
  protocol/
  runtime/
  server/
  tools/
  work/
  workspaces/
```

## System Model

```text
Surface or Connector
  -> Interaction Protocol
  -> Runtime

Work / Workspaces / Jobs
  -> durable tracked work
  -> repo/worktree behavior
  -> dispatch records and execution routing

Gateway access
  -> gateway authentication and session attachment
  -> operator-managed LAN/VPN/tunnel publication

Handoff
  -> local/runtime work submission into Work
```

## Core Rule

One tracked dispatch creates one runtime execution.

## Recommended Toolchain

For desktop, shared UI packages, and client-facing libraries, Aria should standardize on the broader VoidZero stack while using `Vite+` for monorepo management and `bun` as the package manager/runtime choice where supported.

Recommended stack:

- `bun` as package manager/runtime
- `Vite+` where a unified client/web toolchain is applicable
- `Vite` for dev-server and ecosystem compatibility
- `Rolldown` for builds and packaging
- `Oxc` for linting, formatting, and language tooling
- `Vitest` for tests

For the concrete app-shell decisions and Bun-runtime clarification, see [tech-decisions.md](./tech-decisions.md).

## Package Ownership

| Package               | Responsibility                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `@aria/server`        | Aria node bootstrap, composition root, and headless server entrypoint                                   |
| `@aria/runtime`       | Compatibility-facing runtime shell over target-owned runtime surfaces                                   |
| `@aria/protocol`      | Shared request, event, identity, and streaming contracts                                                |
| `@aria/gateway`       | Authenticated API surface and realtime transport handling                                               |
| `@aria/work`          | Project registry, project-thread coordination, environment switching, and Aria-native execution routing |
| `@aria/prompt`        | Prompt assembly pipeline and context overlays                                                           |
| `@aria/harness`       | Agent-facing sessions, capabilities, shell/file environments, roles, skills, tasks, and typed results   |
| `@aria/tools`         | Temporary compatibility exports for legacy tool imports                                                 |
| `@aria/policy`        | Capability policy, approvals, execution restrictions, trust rules                                       |
| `@aria/memory`        | Aria memory layers, skills, context retrieval, assistant knowledge                                      |
| `@aria/automation`    | Heartbeat, cron, webhook, automation scheduling and execution                                           |
| `@aria/persistence`   | Durable database access, repositories, migrations, persistence services                                 |
| `@aria/audit`         | Audit event models, sinks, queries, policy logging hooks                                                |
| `@aria/workspaces`    | Workspace, project, environment, repo, worktree, sandbox models                                         |
| `@aria/jobs`          | Aria-native project job orchestration and lifecycle management                                          |
| `@aria/agent`         | The Aria assistant and coding agent implementation                                                      |
| `@aria/connectors`    | Slack/Telegram/Discord/Teams style connector integrations                                               |
| `@aria/console`       | Server-local terminal UI for chatting with `Aria Agent`                                                 |
| `@aria/access-client` | Shared client transport for desktop and mobile                                                          |

## Current Repo State

The repo is package-first. The package names on this page are the live ownership boundaries. Product apps live under `apps/` and depend on these packages rather than introducing parallel package ownership.

## Tooling Ownership Notes

### Client and shared UI packages

These packages should align with the VoidZero stack first:

- `apps/aria-desktop`
- `@aria/access-client`
- client-facing slices of `@aria/work`

### Runtime and server packages

The server side can still use bun as runtime without every package becoming a Vite+ surface. The important constraint is coherence at the repo level and especially across client-facing packages.

## Monorepo Management Decision

Use:

- `Vite+` as the monorepo-management layer
- `bun` as the package manager/runtime underneath it

This matches the Vite+ workspace model, which documents `vp run` as workspace-aware and dependency-aware across packages while still operating on the normal package graph declared in `package.json`.

## Dependency Direction

The package graph should stay layered.

### Lowest-level shared foundations

- `@aria/protocol`
- `@aria/persistence`
- `@aria/audit`

### Core execution layers

- `@aria/runtime`
- `@aria/prompt`
- `@aria/harness`
- `@aria/tools`
- `@aria/policy`
- `@aria/work`
- `@aria/workspaces`
- `@aria/jobs`

### Assistant and integration layers

- `@aria/agent`
- `@aria/automation`
- `@aria/connectors`

### Product shells

- `@aria/server`
- `apps/aria-desktop`
- `@aria/console`

## Package Boundaries That Matter

### `@aria/agent`

This package should contain only the Aria assistant implementation and Aria-specific assistant logic. It should not become a general server runtime package.

### `@aria/jobs`

This package should not absorb Aria memory, automation, or connector ownership. It is for remote project execution.

### `@aria/work`

This package is where Aria-managed project coordination should live. It should own:

- project registry models
- project-thread metadata
- environment-switch coordination
- dispatch to local or remote Aria node execution targets

It should not absorb low-level repo/worktree mechanics from `@aria/workspaces`, and it should not absorb worker execution from `@aria/jobs`.

### `@aria/connectors`

This package should be server-only. Do not make it a generic desktop plugin host.

## Recommended App Packaging

| App / service  | Depends on                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `aria-server`  | runtime, gateway, work, agent, memory, automation, connectors, jobs, workspaces, persistence, audit, prompt, tools, policy |
| `aria-desktop` | access-client, work, protocol, and local Aria node supervision                                                             |
| `aria` console | console, access-client or a server-local transport shim, protocol                                                          |

## Official References

- [Vite+ official site](https://viteplus.dev/)
- [VoidZero official site](https://voidzero.dev/)

## Directory Naming Guidance

Prefer short, stable names:

- `agent`, not `personal-assistant-agent`
- `agent`, not `assistant-worker`
- `connectors`, not `chat-adapters-runtime`

## Package Model Summary

The key design rule is this:

- Aria node packages own the assistant platform and execution runtime
- `Aria Desktop` owns client UX and local node supervision
- Aria Gateway owns secure transport and access semantics

That separation should stay visible in the repo layout.
