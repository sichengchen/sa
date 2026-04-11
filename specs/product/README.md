# Product Specs

## Identity

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

Aria is one flagship product with four product areas. It is not a family of loosely-coupled tools.

## Product Areas

### Aria Local

Run and supervise agents on the operator's own machine. This is the primary product surface and the source of truth for live work.

### Aria Remote

Control Aria from phone, web, or other paired devices. Remote control is an attachment surface over the same runtime, not a second execution system.

### Aria Automations

Run scheduled and webhook-triggered work on the same runtime substrate used by interactive sessions.

### Aria Projects

Track durable work state, repo workflows, handoff submission, review, and publish flow through the Projects Engine.

## Shared Guarantees

- Aria is local-first. Durable operational state lives on the operator machine by default.
- Aria is durable. Sessions, runs, approvals, and tracked work survive restart.
- Aria is protocol-first. CLI, connectors, automation, relay, and future app surfaces adapt one runtime contract.
- Aria is policy-driven. Tool execution, approvals, and relay access are governed by explicit trust and capability rules.

## Public Surfaces

- `aria` is the primary operator CLI.
- Runtime-backed connector surfaces adapt the same protocol for chat and webhook entrypoints.
- Relay-backed paired devices attach to active runtime sessions.
- Projects workflows are surfaced through `aria projects`.

## Terminology

- Session: durable runtime conversation container
- Run: one live execution inside a session
- Task: durable tracked work record
- Thread: grouped conversation/work log inside Projects
- Dispatch: durable request for one runtime execution

## Non-goals

- Separate remote execution semantics for phone/web surfaces
- Connector-specific task models
- Product naming that preserves retired identities over Aria
