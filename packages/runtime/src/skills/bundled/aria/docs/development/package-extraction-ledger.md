# Phase 1 Package Extraction Ledger

This ledger tracks the phase-1 extraction that seeds target-aligned packages without breaking the current CLI build, tests, or runtime import surface.

## Compatibility Rule

During phase 1, the current `packages/runtime` and `packages/shared-types` entrypoints remain stable compatibility shims. Existing imports keep working while new package ownership becomes explicit.

## Extracted Ownership

| Target package | Extracted source owner | New implementation owner | Compatibility shim kept at |
| --- | --- | --- | --- |
| `@aria/protocol` | `packages/shared-types/src/types.ts`, `packages/shared-types/src/connector.ts` | `packages/protocol/src/` | `packages/shared-types/src/types.ts`, `packages/shared-types/src/connector.ts` |
| `@aria/store` | `packages/runtime/src/operational-store.ts` | `packages/store/src/operational-store.ts` | `packages/runtime/src/operational-store.ts` |
| `@aria/audit` | `packages/runtime/src/audit.ts` | `packages/audit/src/audit.ts` | `packages/runtime/src/audit.ts` |
| `@aria/prompt` | `packages/runtime/src/prompt-engine.ts` | `packages/prompt/src/prompt-engine.ts` | `packages/runtime/src/prompt-engine.ts` |
| `@aria/tools` | `packages/runtime/src/toolsets.ts`, `packages/runtime/src/tools/index.ts` | `packages/tools/src/` | `packages/runtime/src/toolsets.ts`, `packages/runtime/src/tools/index.ts` |
| `@aria/policy` | `packages/runtime/src/capability-policy.ts`, `packages/runtime/src/tools/policy.ts` | `packages/policy/src/` | `packages/runtime/src/capability-policy.ts`, `packages/runtime/src/tools/policy.ts` |

## Phase 1 Notes

- Ownership moved first; consumer import rewrites are intentionally deferred.
- Cross-package imports currently use direct source paths to avoid widening shared build configuration during the first extraction step.
- Runtime-facing wrappers are intentionally tiny so later phases can update import sites package-by-package.
- `@aria/tools` still delegates individual built-in tool implementations to the runtime package in this phase; the package boundary now exists for incremental follow-up extraction.

## Phase 2 Extracted Ownership

| Target package | Extracted source owner | New package entrypoints | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/memory` | `packages/runtime/src/memory/*` | `packages/memory/src/*` | `packages/runtime/src/memory/index.ts` |
| `@aria/automation` | `packages/runtime/src/automation.ts`, `automation-registry.ts`, `automation-schedule.ts`, `scheduler.ts` | `packages/automation/src/*` | `packages/runtime/src/automation*.ts`, `packages/runtime/src/scheduler.ts` |
| `@aria/agent-aria` | `packages/runtime/src/agent/*` | `packages/agent-aria/src/*` | `packages/runtime/src/agent/index.ts` |
| `@aria/connectors-im` | `packages/connectors/src/chat-sdk/*`, platform connector entrypoints | `packages/connectors-im/src/*` | `packages/connectors/src/*` |
| `@aria/console` | `packages/connectors/src/tui/*` | `packages/console/src/*` | `packages/connectors/src/tui/*` |
| `@aria/gateway` | `packages/runtime/src/context.ts`, `procedures.ts`, `server.ts`, `trpc.ts` | `packages/gateway/src/*` | `packages/runtime/src/{context,procedures,server,trpc}.ts` |

## Phase 2 Notes

- This phase seeds the remaining target-state package names without changing CLI/runtime behavior.
- Runtime compatibility shims now forward the public `memory`, `automation`, and `agent` entrypoints to their new package owners.
- `@aria/connectors-im`, `@aria/console`, and `@aria/gateway` currently preserve behavior by exposing package-owned entrypoints that re-export the proven connector/runtime implementations while broader consumer rewrites are deferred.
- The new tsconfig path aliases make the phase-2 package names available for incremental follow-up import rewrites.

## Phase 4 Extracted Ownership

| Target package | Current source owner | New compatibility owner | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/projects` | `packages/projects-engine/src/{blockers,bridge,dispatch,external-refs,planning,publish,repository,reviews,schema,store,types}` | `packages/projects/src/index.ts` | `@aria/projects-engine` |
| `@aria/workspaces` | `packages/projects-engine/src/{repos,worktrees,types}` | `packages/workspaces/src/index.ts` | `@aria/projects-engine` |
| `@aria/jobs` | `packages/projects-engine/src/{bridge,dispatch,types}` | `packages/jobs/src/index.ts` | `@aria/projects-engine` |
| `@aria/agents-coding` | `packages/providers-aria/src/{contracts,subprocess}` plus `packages/providers-{codex,claude-code,opencode}/src/*` | `packages/agents-coding/src/index.ts` | `@aria/providers-aria`, `@aria/providers-codex`, `@aria/providers-claude-code`, `@aria/providers-opencode` |

## Phase 4 Notes

- This phase seeds the next target-state server package names without moving implementation ownership away from `projects-engine` or the provider packages yet.
- The new package barrels intentionally preserve existing class and type names such as `ProjectsEngineRepository` so follow-up import rewrites stay behaviorally safe.
- `@aria/projects` stays focused on tracked-work coordination while `@aria/workspaces` and `@aria/jobs` expose only the repo/worktree and dispatch/job subsets needed for incremental migration.
- `@aria/agents-coding` provides one shared import surface for backend contracts plus Codex, Claude Code, and OpenCode adapters while the existing provider package entrypoints remain stable compatibility paths.

## Next Safe Follow-Ups

1. Add explicit tsconfig/package alias entries for the new package names once the broader team is ready to update shared build config.
2. Rewrite internal consumers from compatibility shims to the new package entrypoints.
3. Continue extracting the remaining tool, prompt, and runtime-adjacent modules behind the new package boundaries.

## Phase 4 Server Package Seam Seeding

This phase seeds the remaining target-state server package names needed for project orchestration without forcing an immediate ownership cutover. The goal is to expose the new import surfaces while keeping the proven implementations and operator behavior stable.

| Target package | Current source owner | Seeded package entrypoints | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/projects` | `packages/projects/src/*` | `packages/projects/src/*` | `@aria/projects-engine` |
| `@aria/workspaces` | `packages/workspaces/src/*` | `packages/workspaces/src/*` | `@aria/projects-engine` |
| `@aria/jobs` | `packages/runtime/src/dispatch-runner.ts` plus durable dispatch records referenced through `packages/projects-engine/src/types.ts` | `packages/jobs/src/*` | `@aria/projects-engine`, `packages/runtime/src/dispatch-runner.ts` |
| `@aria/agents-coding` | `packages/providers-aria`, `packages/providers-codex`, `packages/providers-claude-code`, `packages/providers-opencode` | `packages/agents-coding/src/*` | provider packages remain valid |

### Phase 4 Notes

- The new package names are compatibility surfaces first; they intentionally forward to the current proven implementations while import sites migrate incrementally.
- `packages/runtime/src/backend-registry.ts` now consumes `@aria/agents-coding` so the server-side adapter seam is exercised by runtime code immediately.
- `packages/runtime/src/dispatch-runner.ts` is now a shim over `@aria/jobs`, which lets the remote-job execution seam move without changing the current runtime API.
- Focused tests should cover the new package names directly so the migration slice stays protected during later ownership moves.

## Phase 5 Extracted Ownership

| Target surface | Current source owner | New compatibility owner | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/server` | `packages/runtime/src/{engine,index,runtime}.ts`, `packages/gateway/src/server.ts`, and CLI bootstrap wiring in `packages/cli/src/{engine,index}.ts` | `packages/server/src/index.ts` | `@aria/runtime`, `@aria/gateway`, and the current `aria` CLI engine flow |
| `apps/aria-server` | Root `package.json` scripts plus the current CLI/daemon boot path | `apps/aria-server/*` | Root repo scripts, `dist/index.js`, and the current `aria` binary |

## Phase 5 Notes

- This phase seeds the thin server app/composition-root seam without replacing the current operator-facing CLI during the transition.
- `@aria/server` should compose the already-seeded server-oriented packages rather than collapsing their ownership boundaries back into one large runtime package.
- `apps/aria-server` is intentionally a thin wrapper so deployment and packaging can move forward without duplicating daemon/bootstrap logic.

## Phase 6 Extracted Ownership

| Target surface | Current source owner | New compatibility owner | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/access-client` | `packages/shared-types/src/client.ts` plus `@aria/protocol` / `@aria/projects` types | `packages/access-client/src/index.ts` | `@aria/shared-types`, `@aria/protocol`, and `@aria/projects` |
| `@aria/ui` | Client-facing protocol and project types with no package seam yet | `packages/ui/src/index.ts` | `@aria/protocol` and `@aria/projects` |
| `apps/aria-desktop` | Architecture/docs only | `apps/aria-desktop/*` | Future desktop-specific packages and existing protocol/project surfaces |
| `apps/aria-mobile` | Architecture/docs only | `apps/aria-mobile/*` | Future mobile-specific packages and existing protocol/project surfaces |

## Phase 6 Notes

- This phase seeds the thin client package/app seams without pretending the full desktop or mobile implementations already exist.
- `@aria/access-client` should stay a shared client transport and project-summary seam instead of becoming a second protocol implementation.
- `@aria/ui` should stay pure and host-agnostic so both app wrappers can compose it safely.

## Phase 8 Extracted Ownership

| Target surface | Current source owner | New compatibility owner | Compatibility surface kept at |
| --- | --- | --- | --- |
| `@aria/desktop` | `apps/aria-desktop/src/index.ts` plus shared client shell composition across `@aria/access-client`, `@aria/ui`, and `@aria/projects` | `packages/desktop/src/index.ts` | `apps/aria-desktop`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` |
| `@aria/mobile` | `apps/aria-mobile/src/index.ts` plus shared client shell composition across `@aria/access-client`, `@aria/ui`, and `@aria/projects` | `packages/mobile/src/index.ts` | `apps/aria-mobile`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` |

## Phase 8 Notes

- This phase seeds the target-state desktop/mobile shell package names over the existing thin app wrappers and shared client seams.
- `@aria/desktop` should own shell composition and desktop-facing thread/project surfaces without absorbing bridge, git, or coding-agent execution ownership.
- `@aria/mobile` should stay a remote-first shell over the shared client seams and must not become a local execution surface.

## Phase 9 Architecture Truth Table

Phase 9 is the cross-phase owner-classification pass. It does not move code by itself; it says which package/app is already target-owned, which package/app is a hybrid target shell over compatibility seams, and which target seams are still legacy-owned today.

| Classification | Meaning |
| --- | --- |
| `target-owned` | Edit the target package/app first; any older surface is just a compatibility shim. |
| `hybrid target shell` | Edit the target shell/composition root first, but preserve the listed compatibility seams. |
| `legacy-owned seam` | The target name exists, but the listed legacy owner still ships the behavior. |
| `legacy-only compatibility surface` | Only change this surface to preserve compatibility or to move behavior into its target owner. |

The authoritative package/app-by-package/app truth table lives in [phase-9-architecture-truth-table.md](./phase-9-architecture-truth-table.md).


## Phase 13 Extracted Ownership

| Target surface | Current source owner | New compatibility owner | Compatibility surface kept at |
| --- | --- | --- | --- |
| `services/aria-relay` | `packages/relay/src/{service,store,types}.ts` | `services/aria-relay/src/index.ts` | `@aria/relay` |

## Phase 13 Notes

- This phase seeds the relay service repo shape without moving transport/access logic out of `@aria/relay`.
- `services/aria-relay` must stay a thin wrapper and must not absorb assistant/runtime semantics.
