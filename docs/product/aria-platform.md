# Aria Platform

This page defines the product-level model and naming that every package, app, and doc should follow.

## Public Identity

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

## Product Commitments

- local-first by default
- durable across restart
- one shared interaction model across every surface
- policy-driven tools, approvals, and audit
- extensible through built-in tools, MCP, connectors, and skills

## Product Areas

Esperta Aria is one suite with four durable product areas:

- `Aria Local`
- `Aria Remote`
- `Aria Automations`
- `Aria Projects`

These are not separate backends. They all sit on the same runtime, store, and protocol model.

## Compatibility Stance

Esperta Aria favors the target architecture over legacy naming, folder structure, or wrapper layers.

- remove engine-era seams when they conflict with the target model
- keep `docs/new-architecture/*` as the canonical system design path
- prefer explicit package and app ownership over compatibility re-exports

## North-Star Criteria

The platform is moving toward these non-negotiable outcomes:

- one durable runtime kernel
- one shared interaction protocol
- one repo with explicit package ownership
- server-owned Aria memory, automation, approvals, and connectors
- project execution that can move between local and remote environments without losing thread identity

## Related Reading

- [overview.md](./overview.md)
- [areas.md](./areas.md)
- [glossary.md](./glossary.md)
- [../new-architecture/overview.md](../new-architecture/overview.md)
