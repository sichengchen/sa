# Phase 6 Client Seams Ledger

This ledger tracks the next migration wave for seeding the thin client seams described in [../new-architecture/packages.md](../new-architecture/packages.md) and [../new-architecture/desktop-and-mobile.md](../new-architecture/desktop-and-mobile.md).

Phase 6 is about making the following client product boundaries explicit without pretending the full desktop and mobile shells already exist:

- `@aria/access-client`
- `@aria/ui`
- `apps/aria-desktop`
- `apps/aria-mobile`

## Compatibility Rules

During this phase:

1. Keep the current `@aria/protocol`, `@aria/projects`, and shared transport helpers as the source of truth while the client seams are introduced.
2. Keep the new client packages intentionally thin: compose existing protocol/project surfaces first, delay host-specific desktop/mobile runtime work.
3. Avoid moving server-only ownership (Aria runtime, jobs, connectors, or automation) into the client seams.
4. Preserve the repo-wide Bun/TypeScript workflow while the client package names appear in the workspace graph.

## Current-To-Target Ownership Map

| Target surface | Current source owner | Seeded seam should own | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/access-client` | `packages/shared-types/src/client.ts`, `@aria/protocol`, and client-facing slices of `@aria/projects` | Shared client transport configuration, typed engine-client creation, and project-thread summary shaping for desktop/mobile | `@aria/protocol`, `@aria/projects`, and `@aria/shared-types` |
| `@aria/ui` | Client-facing protocol/project types with no dedicated package seam yet | Shared presentational helpers and view-model shaping for desktop/mobile thread and event surfaces | `@aria/protocol` and `@aria/projects` |
| `apps/aria-desktop` | Architecture/docs only; no explicit app wrapper yet | Thin desktop app bootstrap seam over `@aria/access-client`, `@aria/ui`, and existing project/protocol surfaces | Future desktop-specific packages and the existing server/runtime compatibility layers |
| `apps/aria-mobile` | Architecture/docs only; no explicit app wrapper yet | Thin mobile app bootstrap seam over `@aria/access-client`, `@aria/ui`, and existing project/protocol surfaces | Future mobile-specific packages and the existing server/runtime compatibility layers |

## Review Notes And Hotspots

### `@aria/access-client`

- Keep it host-agnostic so desktop and mobile can share one connection model.
- Reuse the proven typed engine client and existing project records; do not fork a second protocol definition.
- If future work needs auth/session storage, layer it on top of this seam instead of moving it back into app entrypoints.

### `@aria/ui`

- Keep it pure and dependency-light.
- Limit it to shared view models and formatting helpers over protocol/project data.
- Do not let it absorb desktop bridge logic, runtime behavior, or server orchestration.

### `apps/aria-desktop` and `apps/aria-mobile`

- Keep both app seams thin: metadata, bootstrap helpers, and shared package composition only.
- Desktop can reference local-bridge/coding-agent capabilities conceptually, but those implementations still belong in later packages.
- Mobile should stay a remote thin client and avoid any local execution ownership.

## Recommended Extraction Order

1. `@aria/access-client`
2. `@aria/ui`
3. `apps/aria-desktop`
4. `apps/aria-mobile`

This order exposes the shared client contract seams first and then lets the app wrappers compose them without duplicating transport or view-model logic.

## Verification Checklist

Every Phase 6 seam-seeding step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused seam checks:
  - `bun test tests/phase6-client-seams.test.ts`
  - `bun test tests/phase5-server-app-seam.test.ts`

## Exit Condition

Phase 6 is complete when the repo has explicit `@aria/access-client` and `@aria/ui` package seams plus thin `apps/aria-desktop` and `apps/aria-mobile` wrappers, while the current protocol/project/runtime compatibility surfaces remain unchanged and verifiably usable.
