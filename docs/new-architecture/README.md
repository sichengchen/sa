# New Architecture

This folder defines the target-state architecture for the new Aria product shape.

It is intentionally forward-looking. It does not describe the current repo as-is. It describes the architecture the repo should move toward on the `new-aria` line:

- `Aria Server` hosts `Aria Agent`
- `Aria Agent` is the only component that owns Aria-managed memory, context, IM connectors, and automation
- `Aria Agent` can manage projects through a dedicated project control layer
- `Aria Desktop` is a multi-surface client for:
  - server-hosted `Aria`
  - unified `Projects` with local and remote environments
- `Aria Mobile` is a thin client for server-hosted Aria and remote project work
- `Aria Relay` is the secure access and optional hosted-runtime layer

## Document Set

- [overview.md](./overview.md)
- [deployment.md](./deployment.md)
- [relay.md](./relay.md)
- [server.md](./server.md)
- [desktop-and-mobile.md](./desktop-and-mobile.md)
- [tech-decisions.md](./tech-decisions.md)
- [domain-model.md](./domain-model.md)
- [packages.md](./packages.md)

## Canonical Names

| Surface                  | Canonical Name |
| ------------------------ | -------------- |
| Product                  | `Esperta Aria` |
| Server product           | `Aria Server`  |
| Personal assistant       | `Aria Agent`   |
| Desktop client           | `Aria Desktop` |
| Mobile client            | `Aria Mobile`  |
| Secure access layer      | `Aria Relay`   |
| Server-local terminal UI | `Aria Console` |
| CLI binary               | `aria`         |

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
- Read [relay.md](./relay.md) for the secure access and transport model
- Read [server.md](./server.md) for the server-side ownership model
- Read [desktop-and-mobile.md](./desktop-and-mobile.md) for the client model
- Read [tech-decisions.md](./tech-decisions.md) for concrete stack choices
- Read [domain-model.md](./domain-model.md) for the persistent object model
- Read [packages.md](./packages.md) for monorepo naming and package ownership
