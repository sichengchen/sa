# Phase 8 Client Shell Seams Ledger

This ledger tracks the next migration wave for seeding the target-state client shell packages described in [../new-architecture/packages.md](../new-architecture/packages.md) and [../new-architecture/desktop-and-mobile.md](../new-architecture/desktop-and-mobile.md).

Phase 8 is about making the following client shell boundaries explicit without breaking the current app wrappers, shared client seams, or CLI/server/runtime behavior:

- `@aria/desktop`
- `@aria/mobile`

## Compatibility Rules

During this phase:

1. Keep `apps/aria-desktop` and `apps/aria-mobile` working as thin compatibility wrappers while the new package names appear.
2. Keep `@aria/access-client`, `@aria/ui`, and `@aria/projects` as the shared transport, presentation, and project-thread seams underneath the new shell packages; do not duplicate that ownership inside `@aria/desktop` or `@aria/mobile`.
3. Keep desktop-local bridge, git, and coding-agent ownership in `@aria/desktop-bridge`, `@aria/desktop-git`, and `@aria/agents-coding` rather than collapsing those responsibilities into `@aria/desktop`.
4. Keep `@aria/mobile` a remote/server-connected shell with no local coding-agent execution, repo/worktree management, or Aria-memory ownership.
5. Keep the current CLI/server/runtime bootstrap path free of the new client-shell package names while the shell seams are introduced.

## Current-To-Target Ownership Map

| Target surface | Current source owner | Seeded seam should own | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/desktop` | `apps/aria-desktop/src/index.ts` plus shared client shell composition currently spread across `@aria/access-client`, `@aria/ui`, and `@aria/projects` | Desktop shell metadata, navigation/bootstrap composition, and desktop-specific thread/project-shell helpers over the existing client seams | `apps/aria-desktop`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` |
| `@aria/mobile` | `apps/aria-mobile/src/index.ts` plus shared client shell composition currently spread across `@aria/access-client`, `@aria/ui`, and `@aria/projects` | Mobile shell metadata, remote review/navigation composition, and mobile-specific thread/project-shell helpers over the existing client seams | `apps/aria-mobile`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` |

## Review Notes And Hotspots

### `@aria/desktop`

- Keep the package focused on the desktop shell itself: navigation, shell composition, and desktop-facing thread/project views.
- Reuse the existing shared client seams instead of forking transport, project-thread records, or view-model logic.
- Keep local bridge, git, and coding-agent execution as explicitly separate dependencies so the desktop shell does not become a catch-all local-runtime package.

### `@aria/mobile`

- Keep the package focused on remote/server-connected shell composition and review flows.
- Reuse the same shared client seams as desktop wherever possible so the mobile shell stays thin.
- Do not introduce local execution, repo management, automation hosting, or Aria-memory ownership into the mobile shell.

## Recommended Extraction Order

1. `@aria/desktop`
2. `@aria/mobile`
3. rewrite `apps/aria-desktop` and `apps/aria-mobile` to depend on the new package seams as thin wrappers

This order exposes the new shell package names first and only then rewrites the existing app wrappers onto them, which keeps the current app entrypoints stable during the migration.

## Verification Checklist

Every Phase 8 seam-seeding step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused seam/doc checks:
  - `bun test tests/phase7-cli-runtime-stability.test.ts`
  - `bun test tests/phase8-client-shell-seams.test.ts`
  - verify bundled docs are refreshed via `bun scripts/copy-docs.ts`
  - verify embedded bundled docs are refreshed via `bun scripts/embed-skills.ts`

## Exit Condition

Phase 8 is complete when the repo has explicit `@aria/desktop` and `@aria/mobile` package surfaces, `apps/aria-desktop` and `apps/aria-mobile` remain thin wrappers over those shells, and the current CLI/server/runtime plus shared client compatibility behavior remains intact.
