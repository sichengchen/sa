# Projects Engine

`packages/projects-engine` is now a compatibility layer for older tracked-work imports.

The real owners on `new-aria` are:

- `packages/projects` — tracked-work coordination and persistence APIs
- `packages/workspaces` — repo/worktree behavior
- `packages/jobs` — dispatch execution and backend selection

## What This Compatibility Layer Does

- preserves older import paths that still reference `@aria/projects-engine`
- forwards repository/store/schema/type, workspace, and job surfaces to their target owners
- allows incremental migration without breaking downstream callers

## What It Does Not Own

Projects Engine no longer owns the primary tracked-work implementation. New work should land in `projects`, `workspaces`, or `jobs`, not here.

## CLI Surface

`aria projects` still works over the same durable state, but the owning package surfaces are now the target seams described above.
