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

## Cutover Criteria

Before legacy repos are archived:

1. package boundaries are live
2. runtime, projects, handoff, and relay flows are verifiably usable
3. legacy import supports dry-run and write modes
4. tests, typecheck, and build pass
