# Architecture

This folder defines the canonical architecture for Esperta Aria.

It is the architecture the repo should keep aligned to:

- `Aria Server` hosts `Aria Agent`
- `Aria Agent` is the only component that owns Aria-managed memory, context, IM connectors, and automation
- `Aria Agent` can manage projects through a dedicated project control layer
- `Aria Desktop` is a multi-surface client for:
  - server-hosted `Aria`
  - unified `Projects` with local and remote environments
- `Aria Mobile` is a thin client for server-hosted Aria and remote project work
- `Aria Server Gateway` is the built-in secure entrypoint, while LAN/VPN/tunnel reachability stays outside Aria's product boundary

## Document Set

- [overview.md](./overview.md)
- [deployment.md](./deployment.md)
- [runtime.md](./runtime.md)
- [prompt-engine.md](./prompt-engine.md)
- [tool-runtime.md](./tool-runtime.md)
- [automation.md](./automation.md)
- [interaction-protocol.md](./interaction-protocol.md)
- [gateway-access.md](./gateway-access.md)
- [handoff.md](./handoff.md)
- [server.md](./server.md)
- [desktop-and-mobile.md](./desktop-and-mobile.md)
- [tech-decisions.md](./tech-decisions.md)
- [domain-model.md](./domain-model.md)
- [packages.md](./packages.md)

## Canonical Names

| Surface                  | Canonical Name        |
| ------------------------ | --------------------- |
| Product                  | `Esperta Aria`        |
| Server product           | `Aria Server`         |
| Personal assistant       | `Aria Agent`          |
| Desktop client           | `Aria Desktop`        |
| Mobile client            | `Aria Mobile`         |
| Secure access layer      | `Aria Server Gateway` |
| Server-local terminal UI | `Aria Console`        |
| CLI binary               | `aria`                |

## Core Boundary

`Aria Agent` is server-only.

That implies:

- IM connectors are server-only
- Aria-managed memory and context are server-only
- heartbeat, cron, and webhook automation are server-only
- the server-local terminal UI chats only with `Aria Agent`
- local desktop coding threads are not Aria-managed memory threads

## Reader Guide

- Start with [overview.md](./overview.md) for the system map
- Read [deployment.md](./deployment.md) for where each component runs
- Read [runtime.md](./runtime.md) for the runtime kernel and recovery model
- Read [prompt-engine.md](./prompt-engine.md) for the target-state prompt assembly contract
- Read [tool-runtime.md](./tool-runtime.md) for toolsets, policy, and MCP execution
- Read [automation.md](./automation.md) for the server-owned automation model
- Read [interaction-protocol.md](./interaction-protocol.md) for shared request and event contracts
- Read [gateway-access.md](./gateway-access.md) for the secure access and transport model
- Read [handoff.md](./handoff.md) for the durable Aria-to-project-work submission boundary
- Read [server.md](./server.md) for the server-side ownership model
- Read [desktop-and-mobile.md](./desktop-and-mobile.md) for the client model
- Read [tech-decisions.md](./tech-decisions.md) for concrete stack choices
- Read [domain-model.md](./domain-model.md) for the persistent object model
- Read [packages.md](./packages.md) for monorepo naming and package ownership
