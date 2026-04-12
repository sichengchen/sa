# Phase 4 Server Package Seams Ledger

This ledger tracks the next migration wave for seeding the target-state server package seams described in [../new-architecture/packages.md](../new-architecture/packages.md) and [../new-architecture/server.md](../new-architecture/server.md).

Phase 4 is about making the following package boundaries explicit without breaking the current CLI, runtime, or tracked-work behavior:

- `@aria/projects`
- `@aria/jobs`
- `@aria/workspaces`
- `@aria/agents-coding`

## Compatibility Rules

During this phase:

1. Keep current `@aria/projects-engine`, `@aria/handoff`, and `@aria/runtime` entrypoints working while the new seams are introduced.
2. Keep the existing `aria projects` command names and operator-visible behavior stable, especially `runnable`, `queue`, `backends`, `run-dispatch`, `worktree-*`, review, publish, and handoff flows.
3. Preserve the existing backend IDs (`aria`, `codex`, `claude-code`, `opencode`) and provider-specific packages while the higher-level coding-agent seam is seeded.
4. Move ownership first; delay broad CLI renames, route-shape changes, or schema redesign until the compatibility surfaces are proven.

## Current-To-Target Ownership Map

| Target package | Current source owner | Seeded package seam should own | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/projects` | `packages/projects/src/*` plus tracked-work materialization in `packages/handoff/src/service.ts` | Project registry, task/thread/dispatch/review/publish coordination, project-thread orchestration APIs | `@aria/projects-engine`, `@aria/handoff`, and current `aria projects` command names |
| `@aria/workspaces` | `packages/workspaces/src/*` over the target-owned `@aria/projects` persistence APIs | Workspace, repo, worktree, sandbox, and environment models that should stay below project orchestration | `@aria/projects-engine` compatibility wrappers and `aria projects worktree-*` flows |
| `@aria/jobs` | `packages/runtime/src/{dispatch-runner,backend-registry}.ts`, dispatch state types referenced through `packages/projects-engine/src/types.ts`, and CLI dispatch execution wiring in `packages/cli/src/projects.ts` | Remote job launch, backend selection, execution lifecycle, approval-wait transitions, and resumable job orchestration | `@aria/runtime/{dispatch-runner,backend-registry}`, queued dispatch records in `@aria/projects-engine`, and `aria projects run-dispatch` / `backends` |
| `@aria/agents-coding` | Shared backend contracts in `packages/providers-aria/src/*` and provider-specific adapters in `packages/providers-{codex,claude-code,opencode}/src/*` | Shared coding-agent contracts, adapter composition, capability metadata, and a target-state package for Codex / Claude Code / OpenCode orchestration | `@aria/providers-aria`, `@aria/providers-codex`, `@aria/providers-claude-code`, `@aria/providers-opencode`, and current backend IDs |

## Review Notes And Hotspots

### `@aria/projects`

- `packages/projects-engine` is still the durable source of truth for tracked work, so the `@aria/projects` seam should start as an ownership boundary rather than a storage rewrite.
- `packages/handoff/src/service.ts` currently materializes thread, job, and dispatch records directly into `Projects Engine`; keep that integration stable while the package boundary is introduced.
- This seam should align with the target-state `Projects Control` wording in the new-architecture docs and must not absorb low-level repo/worktree mechanics that belong under `@aria/workspaces`.

### `@aria/workspaces`

- Repo and worktree helpers now live in `packages/workspaces/src/*` and build on the target-owned `@aria/projects` persistence APIs.
- The schema and store still persist repo/worktree records in the shared tracked-work database; the workspace seam is now about behavioral ownership rather than a separate storage split.
- Keep branch naming, retention, pruning, and repo registration behavior stable while older compatibility wrappers remain in place.

### `@aria/jobs`

- Dispatch records remain durable tracked-work state; the new jobs seam should own live execution orchestration, not duplicate or replace the durable dispatch ledger.
- `packages/runtime/src/dispatch-runner.ts` currently stitches together dispatch prompts, backend execution, approval waits, and terminal status mapping. That file is the clearest initial seam.
- `packages/runtime/src/backend-registry.ts` currently composes the Aria runtime backend with external coding-agent adapters; extracting jobs should leave the runtime as the compatibility shell until the new package is proven.

### `@aria/agents-coding`

- The current provider packages already encapsulate backend-specific auth probes, subprocess execution, and result parsing. The new seam should compose those adapters rather than flattening them into one package prematurely.
- The target-state name is about coding-agent orchestration, not general model-provider configuration. Keep Aria's own provider/model registry docs separate from this package seam.
- Preserve the current backend identifiers and capability semantics so existing dispatches, CLI flags, and tests do not change behavior during the move.

## Recommended Extraction Order

1. `@aria/workspaces`
2. `@aria/projects`
3. `@aria/agents-coding`
4. `@aria/jobs`

This order peels low-level repo/worktree ownership away from `Projects Engine` first, then introduces the project-control surface, then codifies the coding-agent seam, and finally cuts the higher-coupling remote-job orchestration layer over the stabilized lower boundaries.

## Verification Checklist

Every Phase 4 seam-seeding step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused seam checks:
  - `bun test tests/projects-workflows.test.ts`
  - `bun test tests/dispatch-runner.test.ts`

## Exit Condition

Phase 4 is complete when the repo has explicit compatibility surfaces for `@aria/projects`, `@aria/workspaces`, `@aria/jobs`, and `@aria/agents-coding`, the current `projects-engine` / runtime / provider entrypoints still work as shims, and the package names used in implementation, docs, and CLI guidance match the target-state server architecture.
