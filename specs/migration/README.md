# Migration Specs

## Migration Goal

Expand the current Aria repository into the canonical monorepo, migrate the legacy Esperta Code state into it, and retire legacy repos after cutover.

## Target Package Boundaries

- `packages/runtime`
- `packages/projects-engine`
- `packages/handoff`
- `packages/relay`
- `packages/connectors`
- `packages/shared-types`
- provider packages
- CLI and future app surfaces

## Migration Principles

- Prefer package-owned implementations over legacy compatibility shims.
- Keep `src/*` only as temporary adapters while callers move.
- Runtime owns live execution.
- Projects Engine owns durable tracked-work records.
- Handoff bridges local work into Projects.
- Relay remains a transport/trust layer, not an execution owner.

## Legacy Import Contract

Legacy Esperta Code imports should preserve:

- projects and repos
- tasks, threads, and jobs
- dispatch/worktree relationships where recoverable
- external refs to legacy Linear state

The migration tool must support dry-run reporting before mutation.

## Current Migration State

- runtime code is package-owned, with `src/engine/*` compatibility wrappers still present
- projects-engine durable schema exists
- handoff and relay packages exist with working persistence models
- CLI surfaces now cover more tracked-work and relay workflows
- specs are being promoted from placeholders to canonical contracts

## Cutover Criteria

Before legacy repo retirement:

1. monorepo package boundaries are live
2. runtime, projects, handoff, and relay flows are verifiably usable
3. legacy import has a dry-run and a write path
4. tests, typecheck, and build pass
5. remaining compatibility shims are explicitly documented

## Archive Procedure

- freeze legacy repos after final import validation
- verify imported records are queryable in the monorepo
- archive or close legacy repos only after the monorepo path is the active operational path
