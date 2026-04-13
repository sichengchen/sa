# Phase 13 Relay Service Seam Ledger

This ledger tracks the relay productization wave that makes the target-state service surface explicit without changing the transport/access-only role described in `docs/new-architecture/relay.md`.

Phase 13 is about making the following boundary explicit:

- `services/aria-relay`

## Compatibility Rules

During this phase:

1. Keep `@aria/relay` as the package-owned implementation of relay control/data/push behavior.
2. Introduce `services/aria-relay` only as a thin service wrapper.
3. Do not move assistant, runtime, memory, automation, or project-control ownership into relay.
4. Keep current CLI/server/client behavior stable while aligning repo layout with docs.

## Current-To-Target Ownership Map

| Target surface        | Current source owner                          | Seeded seam should own                                                     | Compatibility surface kept at |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| `services/aria-relay` | `packages/relay/src/{service,store,types}.ts` | Thin deployable/service wrapper for relay transport and access composition | `@aria/relay`                 |

## Review Notes

- The relay service wrapper should compose `RelayStore` and `RelayService` and expose service metadata only.
- The service wrapper must not become a second runtime or assistant host.
- The repo layout should now match the `services/aria-relay/` expectation in `docs/new-architecture/packages.md`.

## Verification Checklist

- `bun run typecheck`
- `bun test tests/phase13-relay-service-seam.test.ts`
- `bun run build`

## Exit Condition

Phase 13 is complete when the repo has a real `services/aria-relay` wrapper, docs mention it as the current relay-service seam, and `@aria/relay` remains the underlying transport/access implementation owner.
