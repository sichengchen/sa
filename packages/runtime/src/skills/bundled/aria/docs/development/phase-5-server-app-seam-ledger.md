# Phase 5 Server App Seam Ledger

This ledger tracks the next migration wave for seeding the target-state server app seam described in [../new-architecture/packages.md](../new-architecture/packages.md) and [../new-architecture/server.md](../new-architecture/server.md).

Phase 5 is about making the following server product boundaries explicit without breaking the current CLI, daemon, or gateway behavior:

- `@aria/server`
- `apps/aria-server`

## Compatibility Rules

During this phase:

1. Keep the current `aria` CLI entrypoints and `aria engine {start,stop,status,logs,restart}` behavior stable while the new server seam is introduced.
2. Keep the current `@aria/runtime` and `@aria/gateway` entrypoints working as compatibility surfaces while `@aria/server` becomes the composition root.
3. Preserve runtime-home discovery, auth bootstrapping, default ports, PID/URL discovery files, and webhook transport behavior.
4. Move server composition first; delay broad deployment, config-schema, or connector-surface rewrites until the thin app seam is proven.

## Current-To-Target Ownership Map

| Target surface     | Current source owner                                                                                                                                       | Seeded seam should own                                                                                                                                                         | Compatibility surface kept at                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `@aria/server`     | `packages/server/src/{app,brand,daemon,discovery,engine,runtime}.ts` plus `packages/gateway/src/server.ts` and remaining `@aria/runtime` kernel submodules | Server bootstrap helpers, runtime + gateway composition root, runtime-home/brand helpers, discovery-file lifecycle coordination, and a package-owned Aria Server entry surface | `@aria/runtime`, `@aria/gateway`, and the current `aria` CLI boot path |
| `apps/aria-server` | Root `package.json` scripts plus the current CLI/daemon launch flow in `packages/cli/src/index.ts` and `packages/runtime/src/engine.ts`                    | Thin deployable app wrapper for local dev/build/start flows that runs `@aria/server` without re-owning runtime internals                                                       | Root repo scripts, `dist/index.mjs`, and the current `aria` binary     |

## Review Notes And Hotspots

### `@aria/server`

- `packages/server/src/{brand,daemon,discovery,engine,runtime}.ts` now own the daemon bootstrap, runtime-home/brand helpers, discovery-file lifecycle, and the live server composition root; keep any remaining compatibility wrappers thin.
- `packages/gateway/src/server.ts` should stay focused on transport/auth concerns; the new package seam should compose it, not move assistant or project logic into the gateway layer.
- `@aria/server` should depend on the already-seeded server packages (`@aria/gateway`, `@aria/agent-aria`, `@aria/projects`, `@aria/jobs`, `@aria/workspaces`, `@aria/memory`, `@aria/automation`, `@aria/connectors-im`) instead of recreating their boundaries.

### `apps/aria-server`

- The app layer should stay thin: launch, config wiring, and packaging only. It should not become a second runtime implementation tree.
- Keep the existing CLI/TUI/operator flows working while the server app shell appears; the app seam is about deployment shape, not replacing `aria` during the transition.
- Avoid duplicating runtime-home, PID file, or restart-marker logic across the app and runtime compatibility wrappers.

## Recommended Extraction Order

1. `@aria/server`
2. `apps/aria-server`
3. CLI/runtime import rewrites onto the new server seam

This order exposes the package-owned composition root first, then adds the thin app wrapper, and only then rewrites the compatibility entrypoints that currently boot the runtime directly.

## Verification Checklist

Every Phase 5 seam-seeding step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused seam checks:
  - `bun test tests/phase5-server-app-seam.test.ts`
  - `bun test tests/gateway-package.test.ts`

## Exit Condition

Phase 5 is complete when the repo has an explicit `@aria/server` package surface and a thin `apps/aria-server` wrapper, while the current `aria` CLI, `@aria/runtime`, and gateway-compatible operator behavior still boot the same server/runtime stack.
