# Phase 2 Package Extraction Ledger

This ledger tracks the **Phase 2** extraction of Aria-owned server and connector surfaces from `packages/runtime` and `packages/connectors` into the target-aligned packages described in [../new-architecture/packages.md](../new-architecture/packages.md).

Phase 2 is about moving implementation ownership for:

- `@aria/agent-aria`
- `@aria/memory`
- `@aria/automation`
- `@aria/gateway`
- `@aria/connectors-im`
- `@aria/console`

The goal is to make those boundaries explicit **without** breaking the current CLI, runtime behavior, or the compatibility shims introduced in Phase 1.

## Compatibility Rules

During Phase 2:

1. Keep existing `@aria/runtime` export paths working while implementation moves behind them.
2. Keep connector/operator behavior stable while the target connector and console packages become the direct import surfaces.
3. Preserve operator-visible behavior for `aria automation`, `aria memory`, TUI `/automation`, TUI `/memory`, webhook endpoints, and current runtime-home storage paths.
4. Prefer moving implementation ownership first; delay route-shape churn, CLI renames, or connector UX changes until the new package seams are stable.

## Extracted Ownership

| Target package        | Current source owner                                                                                                                                                                | New implementation owner      | Compatibility shim kept at                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@aria/agent-aria`    | `packages/runtime/src/agent/*` and runtime composition in `packages/runtime/src/runtime.ts`                                                                                         | `packages/agent-aria/src/`    | `packages/runtime/src/agent/*`, `packages/runtime/src/index.ts`                                                                           |
| `@aria/memory`        | `packages/runtime/src/memory/*` with runtime wiring in `packages/runtime/src/runtime.ts` and `packages/runtime/src/procedures.ts`                                                   | `packages/memory/src/`        | `packages/runtime/src/memory/*`, `packages/runtime/src/index.ts`                                                                          |
| `@aria/automation`    | `packages/runtime/src/automation.ts`, `automation-registry.ts`, `automation-schedule.ts`, `scheduler.ts`, plus automation bridges in `runtime.ts`, `server.ts`, and `procedures.ts` | `packages/automation/src/`    | `packages/runtime/src/automation.ts`, `automation-registry.ts`, `automation-schedule.ts`, `scheduler.ts`, `packages/runtime/src/index.ts` |
| `@aria/gateway`       | `packages/gateway/src/*` with `@aria/runtime/{server,procedures,trpc,context}` kept as compatibility shims                                                                          | `packages/gateway/src/`       | `packages/runtime/src/server.ts`, `trpc.ts`, `context.ts`, `procedures.ts`, `packages/runtime/src/index.ts`                               |
| `@aria/connectors-im` | `packages/connectors-im/src/`                                                                                                                                                       | `packages/connectors-im/src/` | direct target package imports                                                                                                             |
| `@aria/console`       | `packages/console/src/`                                                                                                                                                             | `packages/console/src/`       | direct target package imports                                                                                                             |

## Review Notes And Hotspots

### `@aria/agent-aria`

- `packages/runtime/src/agent/index.ts` is already a clean barrel and is the safest compatibility seam.
- Keep `packages/runtime/src/runtime.ts` as the temporary composition shell while agent construction moves behind the new package boundary.
- Avoid coupling this package to server transport or connector-specific behavior.

### `@aria/memory`

- The durable memory core is already isolated under `packages/runtime/src/memory/*`.
- `packages/runtime/src/procedures.ts` exposes the operator-facing inspection surface; keep procedure names and response shapes stable during extraction.
- Memory tool wrappers should remain tool-owned call sites under `@aria/tools`; Phase 2 should move the underlying memory services, not duplicate tool definitions.

### `@aria/automation`

- Automation behavior is currently split across cadence math (`automation-schedule.ts`), durable registry sync (`automation-registry.ts`), scheduling (`scheduler.ts`), and execution/logging (`automation.ts`).
- `packages/runtime/src/server.ts` and `packages/runtime/src/procedures.ts` both bridge into automation flows, so they should become thin shims instead of being rewritten wholesale.
- Preserve run logging, retry metadata, delivery metadata, and persisted config semantics.

### `@aria/gateway`

- `packages/gateway/src/server.ts` owns HTTP/WebSocket transport, webhook auth, webhook task dispatch, and app-router wiring.
- `packages/runtime/src/{server,trpc,context,procedures}.ts` should remain thin compatibility seams rather than the long-term gateway owner.
- Treat gateway as a transport/auth shell. Do not let it absorb assistant logic, automation policy, or memory ownership.

### `@aria/connectors-im`

- The target connector package now owns the shared IM-connector support code directly.
- WeChat is the main outlier because it owns login and long-polling state in addition to protocol streaming; keep that asymmetry documented during the move.

### `@aria/console`

- The current console surface is the Ink TUI under `packages/console/src/*`.
- TUI slash commands for `/memory` and `/automation` depend on existing admin procedures; keep those integrations behaviorally identical while moving UI ownership.

## Recommended Extraction Order

1. `@aria/memory`
2. `@aria/automation`
3. `@aria/agent-aria`
4. `@aria/console`
5. `@aria/connectors-im`
6. `@aria/gateway`

This order keeps lower-level Aria-owned services moving before the higher-coupling transport shell. `@aria/gateway` stays last because it is the integration boundary for auth, transport, procedures, and webhook routing.

## Verification Checklist

Every Phase 2 extraction step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused smoke checks for:
  - `aria automation`
  - `aria memory`
  - TUI startup and `/automation`, `/memory`
  - connector CLI entrypoints
  - webhook and websocket startup paths when gateway-related files move

## Exit Condition

Phase 2 is complete when each listed domain has a package-owned implementation path and operator-visible CLI/runtime behavior remains unchanged.
