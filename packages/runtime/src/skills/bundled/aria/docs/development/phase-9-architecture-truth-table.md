# Phase 9 Architecture Truth Table

This ledger closes the remaining ownership ambiguity on the `new-aria` line. It says, in one place, whether a surface is already owned by its target package/app name, still ships from a legacy compatibility owner, or is a target shell that deliberately composes older seams during the cutover.

Use this page whenever a package name appears in the target architecture docs and you need to know which repo surface should be edited first today.

## Ownership Classification Truth Table

| Classification | Target package/app exists | Current behavior ships from target owner | Legacy compatibility owner still matters | Meaning |
| --- | --- | --- | --- | --- |
| `target-owned` | yes | yes | optional | The target package/app is the current implementation owner. If an older surface still exists, treat it as a shim. |
| `hybrid target shell` | yes | yes | yes | The target shell/composition root is live, but it intentionally depends on compatibility seams that must stay stable during migration. |
| `legacy-owned seam` | yes | no | yes | The target name is present for imports/docs, but proven behavior still lives in the listed legacy owner. |
| `legacy-only compatibility surface` | no | no | yes | The surface is outside the target package model and exists only to preserve operator/runtime compatibility during migration. |

## Target-Surface Owner Classification

| Target surface | Classification | Current repo owner to edit first | Compatibility surfaces still active | Notes |
| --- | --- | --- | --- | --- |
| `@aria/protocol` | `target-owned` | `packages/protocol/src/*` | `@aria/shared-types` type/connector exports | Phase 1 moved the protocol contracts under the target package name; old shared-type entrypoints are compatibility exports. |
| `@aria/store` | `target-owned` | `packages/store/src/*` | `@aria/runtime` store wrappers | Durable persistence now belongs under the target package boundary. |
| `@aria/audit` | `target-owned` | `packages/audit/src/*` | `@aria/runtime` audit wrappers | Audit behavior should move forward in the target package first. |
| `@aria/prompt` | `target-owned` | `packages/prompt/src/*` | `@aria/runtime` prompt wrappers | Prompt assembly is already package-owned. |
| `@aria/tools` | `target-owned` | `packages/tools/src/*` | `@aria/runtime` tool exports | Keep the package boundary primary even where built-in tools still delegate through runtime-facing shims. |
| `@aria/policy` | `target-owned` | `packages/policy/src/*` | `@aria/runtime` policy exports | Approval/policy logic is target-owned. |
| `@aria/memory` | `target-owned` | `packages/memory/src/*` | `@aria/runtime` memory exports | Aria memory now belongs under the target package name even while runtime keeps compatibility entrypoints. |
| `@aria/automation` | `target-owned` | `packages/automation/src/*` | `@aria/runtime` automation/scheduler exports | Automation logic is target-owned; runtime paths stay compatible for now. |
| `@aria/agent-aria` | `target-owned` | `packages/agent-aria/src/*` | `@aria/runtime` agent exports | The Aria assistant implementation is target-owned. |
| `@aria/gateway` | `target-owned` | `packages/gateway/src/*` | `@aria/runtime` server/tRPC/context entrypoints | Gateway transport/auth behavior should change in the target package first. |
| `@aria/connectors-im` | `target-owned` | `packages/connectors-im/src/*` | `packages/connectors/src/*` for older entrypoints and remaining tails such as WeChat | The target IM-connector package is live, but a few legacy connector surfaces still need compatibility treatment. |
| `@aria/console` | `target-owned` | `packages/console/src/*` | `packages/connectors/src/tui/*`, local shared client helpers | The console package owns the TUI surface even though older connector/runtime helpers still exist underneath. |
| `@aria/projects` | `target-owned` | `packages/projects/src/*` | `@aria/projects-engine` compatibility wrappers | The target package now owns project-control coordination and persistence APIs; the legacy package only preserves the older import surface. |
| `@aria/workspaces` | `target-owned` | `packages/workspaces/src/*` | `@aria/projects-engine` compatibility wrappers and `@aria/projects` persistence APIs | Repo/worktree ownership now lives in the target package even though older compatibility imports still exist. |
| `@aria/jobs` | `target-owned` | `packages/jobs/src/*` | `@aria/projects-engine` dispatch/type wrappers and `@aria/runtime/src/dispatch-runner.ts` | Dispatch lifecycle ownership now lives in the target jobs package even though legacy entrypoints still re-export it. |
| `@aria/agents-coding` | `target-owned` | `packages/agents-coding/src/*` | `@aria/providers-aria`, `@aria/providers-codex`, `@aria/providers-claude-code`, `@aria/providers-opencode` compatibility wrappers | The target seam now owns the shared backend contracts and concrete adapter implementations while provider packages preserve older imports. |
| `@aria/access-client` | `target-owned` | `packages/access-client/src/*` | `@aria/shared-types` client transport factory and target package type inputs | Client-facing access helpers are already target-owned. |
| `@aria/ui` | `target-owned` | `packages/ui/src/*` | `@aria/projects` / `@aria/protocol` type providers | Shared UI helpers are target-owned and should stay presentation-focused. |
| `@aria/server` | `hybrid target shell` | `packages/server/src/*` | `@aria/runtime`, `@aria/gateway`, `@aria/shared-types`, and the `aria` CLI boot path | The target server composition root plus brand/daemon/discovery lifecycle shell are live, but the legacy CLI launch path still has to stay stable. |
| `apps/aria-server` | `hybrid target shell` | `apps/aria-server/*` | root `package.json` scripts, `dist/index.js`, and the `aria` binary | The app wrapper is target-named, but the current operator entrypoints still route through compatibility launch surfaces. |
| `@aria/desktop` | `hybrid target shell` | `packages/desktop/src/*` | `apps/aria-desktop`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` | The desktop shell is real, but it intentionally composes shared seams that are still mid-migration. |
| `@aria/mobile` | `hybrid target shell` | `packages/mobile/src/*` | `apps/aria-mobile`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` | The mobile shell is real, but it stays thin over shared client/project seams. |
| `apps/aria-desktop` | `hybrid target shell` | `apps/aria-desktop/*` | `@aria/desktop`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` | The target desktop app wrapper exists, but it remains a thin shell over the shared client stack. |
| `apps/aria-mobile` | `hybrid target shell` | `apps/aria-mobile/*` | `@aria/mobile`, `@aria/access-client`, `@aria/ui`, and `@aria/projects` | The target mobile app wrapper exists, but it remains a thin shell over the shared client stack. |
| `@aria/desktop-bridge` | `target-owned` | `packages/desktop-bridge/src/*` | `@aria/agents-coding`, `@aria/projects`, and `@aria/desktop-git` | Desktop-local execution bridging already lives behind the target package name. |
| `@aria/desktop-git` | `target-owned` | `packages/desktop-git/src/*` | `@aria/workspaces` and `@aria/projects` data/services | Desktop-local git/worktree helpers are target-owned even while they consume compatibility seams underneath. |
| `@aria/relay` | `target-owned` | `packages/relay/src/*` | none beyond normal package consumers | Relay already matches the target package naming model. |

## Legacy Compatibility Owners Still In Play

| Legacy or compatibility surface | Classification | Current responsibility today | Target owner(s) it feeds | Migration note |
| --- | --- | --- | --- | --- |
| `@aria/runtime` | `legacy-only compatibility surface` | Runtime bootstrap wrappers, compatibility exports, and a few still-live server/job seams | `@aria/server`, `@aria/gateway`, `@aria/agent-aria`, `@aria/memory`, `@aria/automation`, `@aria/prompt`, `@aria/tools`, `@aria/policy`, `@aria/store`, `@aria/audit`, `@aria/jobs` | Keep this stable while server-oriented target packages absorb the last compatibility-only behavior. |
| `@aria/projects-engine` | `legacy-only compatibility surface` | Compatibility re-exports for project/workspace/job persistence and coordination surfaces | `@aria/projects`, `@aria/workspaces`, `@aria/jobs` | Keep this stable for older imports, but put new project, workspace, and job behavior under the target packages first. |
| `packages/connectors` | `legacy-only compatibility surface` | Older connector entrypoints, TUI-era exports, and the remaining non-migrated connector tails | `@aria/connectors-im`, `@aria/console` | Prefer the target packages for new work; touch `packages/connectors` only when maintaining compatibility or moving a remaining tail. |
| `@aria/providers-aria` and `@aria/providers-{codex,claude-code,opencode}` | `legacy-only compatibility surface` | Compatibility wrappers for older coding-agent adapter import paths | `@aria/agents-coding` | Keep these stable for older imports, but put new coding-agent behavior under the target seam first. |
| `@aria/shared-types` | `legacy-only compatibility surface` | Compatibility re-exports for older shared type, client, markdown, connector, and brand import paths | `@aria/protocol`, `@aria/access-client`, `@aria/ui`, `@aria/server` | Keep compatibility exports stable until all callers move fully onto the target packages; compatibility tests should lock the wrapper behavior. |
| `packages/cli` and the `aria` binary | `legacy-only compatibility surface` | Operator CLI entrypoints, daemon commands, and current local launch flows | `@aria/server`, `apps/aria-server`, `@aria/console` | Treat the CLI as an operator surface, not a reason to move server ownership back out of the target packages. |

## Decision Rule

When docs and repo layout disagree, use this order:

1. If the surface is `target-owned`, edit the target package/app first.
2. If the surface is a `hybrid target shell`, edit the target shell first and preserve every listed compatibility seam.
3. If the surface is a `legacy-owned seam`, change behavior in the listed legacy owner unless the task explicitly includes the cutover itself.
4. If the surface is a `legacy-only compatibility surface`, only change it to preserve compatibility or to move behavior into its named target owner.

## Related Ledgers

- [package-extraction-ledger.md](./package-extraction-ledger.md) — phase-by-phase extraction history
- [phase-2-extraction-ledger.md](./phase-2-extraction-ledger.md) — memory/automation/agent/gateway/connector wave
- [phase-4-server-package-seams-ledger.md](./phase-4-server-package-seams-ledger.md) — project/workspace/jobs/agents-coding seam wave
- [phase-5-server-app-seam-ledger.md](./phase-5-server-app-seam-ledger.md) — server app/composition-root wave
- [phase-6-client-app-seams-ledger.md](./phase-6-client-app-seams-ledger.md) — shared client/app seam wave
- [phase-8-client-shell-seams-ledger.md](./phase-8-client-shell-seams-ledger.md) — desktop/mobile shell wave
