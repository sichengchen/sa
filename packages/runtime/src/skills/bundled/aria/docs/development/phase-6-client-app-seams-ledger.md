# Phase 6 Client App Seams Ledger

This ledger tracks the next migration wave for seeding the target-state client app seams described in [../new-architecture/packages.md](../new-architecture/packages.md) and [../new-architecture/desktop-and-mobile.md](../new-architecture/desktop-and-mobile.md).

Phase 6 is about making the following client-facing boundaries explicit without breaking the current server, CLI, console, or project-control behavior:

- `@aria/access-client`
- `@aria/ui`
- `apps/aria-desktop`
- `apps/aria-mobile`

## Compatibility Rules

During this phase:

1. Keep the current `aria` CLI, daemon, gateway, and console behavior stable while the client package and app seams are introduced.
2. Keep the current protocol, auth, and project-control entrypoints working as compatibility surfaces while `@aria/access-client` becomes the shared client transport seam.
3. Keep desktop-local worktree, git, and coding-agent orchestration in the existing runtime/project packages or future bridge packages; do not collapse those responsibilities into `@aria/ui`.
4. Keep `Aria Mobile` as a thin server client with no local coding-agent execution, repo management, or Aria-memory ownership.
5. Keep the repo workspace model (`packages/*`, `apps/*`) and existing build/test command surface stable while the new client seams are seeded.

## Current-To-Target Ownership Map

| Target surface        | Current source owner                                                                                                                                            | Seeded seam should own                                                                                                                                                         | Compatibility surface kept at                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `@aria/access-client` | `packages/shared-types/src/client.ts`, runtime-home/auth bootstrap helpers used by `packages/console/src/client.ts`, and other engine-client connection helpers | Shared client transport creation, auth-token aware connection bootstrapping, and desktop/mobile-facing server access helpers                                                   | `@aria/shared/client`, console client helpers, and current gateway/protocol entrypoints |
| `@aria/ui`            | Console-oriented presentation components in `packages/console/src/*.tsx` plus existing CLI/operator UI patterns                                                 | Shared UI primitives and presentation components for desktop/mobile shells without re-owning business logic                                                                    | Current console components and operator-facing CLI/TUI surfaces                         |
| `apps/aria-desktop`   | Current root workspace/app conventions plus console/project/runtime surfaces that already express desktop-adjacent behavior                                     | Thin desktop shell entrypoint that composes `@aria/access-client`, `@aria/projects`, future desktop bridge seams, and `@aria/ui` without re-implementing backend/project logic | Root workspace scripts, current console flows, and server-side project/runtime packages |
| `apps/aria-mobile`    | Current root workspace/app conventions plus server-hosted Aria/project thread surfaces                                                                          | Thin mobile shell entrypoint over `@aria/access-client` and `@aria/ui` for server-connected Aria/project views only                                                            | Root workspace scripts plus current server/gateway/project surfaces                     |

## Review Notes And Hotspots

### `@aria/access-client`

- `packages/shared-types/src/client.ts` already owns the typed tRPC client factory; the new seam should wrap and re-export proven transport/auth helpers rather than fork them.
- Keep runtime-home discovery and token-file lookup behavior aligned with the existing console client helpers until a dedicated multi-server config story exists.
- Do not move server-side protocol or gateway ownership into the client package; this phase is about a client seam, not a transport rewrite.

### `@aria/ui`

- The UI package should stay presentation-focused and avoid becoming a second project/runtime orchestration layer.
- Prefer extracting shared components and view-model boundaries from the console/UI surfaces over inventing unrelated abstractions.
- Keep desktop/mobile shell code thin and let the shared UI package expose reusable pieces instead of app-owned duplicates.

### `apps/aria-desktop` and `apps/aria-mobile`

- Both app layers should stay thin: launch, shell composition, and app-specific packaging only.
- `apps/aria-desktop` can compose local-project surfaces, but the local bridge, git, and coding-agent ownership should stay outside the app shell.
- `apps/aria-mobile` must remain a remote/server-connected surface and should not gain local worker, repo, or background automation responsibilities.
- Avoid duplicating server URLs, auth wiring, or project/environment selection logic across the two app shells when shared client seams can own them.

## Recommended Extraction Order

1. `@aria/access-client`
2. `@aria/ui`
3. `apps/aria-desktop`
4. `apps/aria-mobile`
5. follow-on client-shell rewrites onto the new seams

This order exposes the shared client packages first, then adds thin app wrappers, and only then rewrites any compatibility entrypoints that currently carry client-adjacent responsibilities.

## Verification Checklist

Every Phase 6 seam-seeding step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused seam/doc checks:
  - `bun test tests/phase6-client-app-seams.test.ts`
  - verify bundled docs are refreshed via `bun scripts/copy-docs.ts`
  - verify embedded bundled docs are refreshed via `bun scripts/embed-skills.ts`

## Exit Condition

Phase 6 is complete when the repo has explicit `@aria/access-client` and `@aria/ui` package surfaces plus thin `apps/aria-desktop` and `apps/aria-mobile` wrappers, while the current CLI, console, server, and project/runtime compatibility behavior remains intact.
