# Migration

## Goal

Converge the repo on package-owned implementations and retire old assumptions about legacy trees and repos after the data and workflow cutover is complete.

## Target Boundaries

- `packages/runtime`
- `packages/projects-engine`
- `packages/handoff`
- `packages/relay`
- `packages/connectors`
- `packages/shared-types`
- provider packages
- CLI and future app surfaces

## Principles

- prefer package-owned implementations over compatibility wrappers
- remove temporary trees once replacements are live
- keep runtime responsible for execution
- keep Projects Engine responsible for durable work state
- keep Relay responsible for remote trust and transport
- keep Handoff responsible for submission into Projects

## Legacy Import

The legacy import path should preserve:

- projects and repos
- tasks, threads, and jobs
- dispatch and worktree relationships where recoverable
- external refs to legacy systems

The migration tool supports dry-run reporting before mutation.

## Current State

- the root `src` tree is removed
- runtime, connectors, CLI, Projects Engine, Handoff, Relay, and shared types are package-owned
- docs are becoming the only canonical documentation tree

## Phase 1 Runtime Extraction

Phase 1 keeps the current CLI and runtime behavior stable while splitting runtime-owned protocol, store, audit, prompt, tools, and policy code into target-aligned packages.

Use the [runtime extraction ledger](./runtime-extraction-ledger.md) as the source of truth for:

- the current runtime-owned entrypoints for each domain
- the target package each domain should move into
- extraction order and compatibility constraints
- verification expectations before and after each move

## Phase 4 Server Package Seams

Phase 4 keeps the current tracked-work and runtime behavior stable while seeding the target-state server package seams for `@aria/projects`, `@aria/workspaces`, `@aria/jobs`, and `@aria/agents-coding`.

Use the [phase 4 server package seams ledger](./phase-4-server-package-seams-ledger.md) as the source of truth for:

- the current `projects-engine`, runtime, and provider-owned entrypoints behind each seam
- the compatibility surfaces that must stay stable while the new package names appear
- extraction order and review hotspots for the server-oriented package wave
- focused verification expectations for project/workspace and dispatch/backend paths

## Phase 5 Server App Seam

Phase 5 keeps the current CLI, daemon, and gateway behavior stable while seeding the target-state server product seam for `@aria/server` and `apps/aria-server`.

Use the [phase 5 server app seam ledger](./phase-5-server-app-seam-ledger.md) as the source of truth for:

- the current CLI/runtime/gateway-owned bootstrap entrypoints behind the server seam
- the compatibility surfaces that must stay stable while the new package and app names appear
- the extraction order and review hotspots for the server composition-root wave
- focused verification expectations for docs, embedded-skill docs, and server-entry compatibility

## Phase 6 Client App Seams

Phase 6 keeps the current CLI, server, console, and project-control behavior stable while seeding the target-state client package/app seams for `@aria/access-client`, `@aria/ui`, `apps/aria-desktop`, and `apps/aria-mobile`.

Use the [phase 6 client app seams ledger](./phase-6-client-app-seams-ledger.md) as the source of truth for:

- the current shared transport/UI entrypoints behind the client seams
- the compatibility surfaces that must stay stable while the new package and app names appear
- the extraction order and review hotspots for the shared-client and thin-app wave
- focused verification expectations for docs, bundled docs, and embedded-skill refreshes

## Phase 8 Client Shell Seams

Phase 8 keeps the current app wrappers and shared client seams stable while seeding the target-state shell packages for `@aria/desktop` and `@aria/mobile`.

Use the [phase 8 client shell seams ledger](./phase-8-client-shell-seams-ledger.md) as the source of truth for:

- the current app-wrapper and shared-client entrypoints behind the new shell packages
- the compatibility surfaces that must stay stable while the `@aria/desktop` and `@aria/mobile` package names appear
- the extraction order and review hotspots for the desktop/mobile shell-package wave
- focused verification expectations for docs, bundled docs, embedded-skill refreshes, and client-shell stability checks

## Phase 9 Architecture Truth Table

Phase 9 does not seed a new package name. It closes the remaining ambiguity about which surfaces are target-owned today, which surfaces are hybrid target shells over compatibility seams, and which surfaces still ship from legacy owners.

Use the [phase 9 architecture truth table](./phase-9-architecture-truth-table.md) as the source of truth for:

- whether a target package/app name is already the current implementation owner
- which legacy compatibility surface still ships behavior when a target seam exists only as a facade
- which package/app should be edited first when target architecture docs and repo history appear to disagree
- which earlier phase ledger still governs a surface after the owner classification is known

## Cutover Criteria

Before legacy repos are archived:

1. package boundaries are live
2. runtime, projects, handoff, and relay flows are verifiably usable
3. legacy import supports dry-run and write modes
4. tests, typecheck, and build pass
