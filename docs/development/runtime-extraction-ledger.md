# Runtime Extraction Ledger

This ledger tracks the **Phase 1** work for splitting runtime-owned subsystems into the target-aligned packages described in [../new-architecture/packages.md](../new-architecture/packages.md).

## Scope

Today the repo is still package-first, but the following domains remain implemented inside `@aria/runtime`:

- protocol-facing runtime procedures
- operational store and recovery helpers
- audit services
- prompt assembly
- tool runtime
- policy and approval enforcement

Phase 1 keeps current CLI and runtime behavior intact while creating an explicit move map for those domains.

## Current-To-Target Ledger

| Domain   | Current runtime-owned surface                                                                                                              | Target package   | Phase 1 review notes                                                                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol | `packages/runtime/src/procedures.ts`, `trpc.ts`, `server.ts`, `router/*`                                                                   | `@aria/protocol` | Treat this as the integration boundary and move it last. `procedures.ts` currently stitches together runtime, automation, tools, policy, audit, and shared types. Shared wire types already live in `@aria/shared-types`; Phase 1 should avoid protocol-shape churn while extracting runtime-owned procedure helpers. |
| Store    | `packages/runtime/src/operational-store.ts`, `sessions.ts`, `session-archive.ts`, `checkpoints.ts`                                         | `@aria/store`    | Schema, archive, and checkpoint behavior are operator-visible durability surfaces. Keep `aria.db`, archive formats, and recovery semantics stable while extracting store code behind package-owned entrypoints.                                                                                                       |
| Audit    | `packages/runtime/src/audit.ts`, CLI usage in `packages/cli/src/audit.ts`                                                                  | `@aria/audit`    | `audit.log` is a hard security boundary. Preserve append-only behavior, file rotation, and query semantics; extraction should not loosen audit guarantees or change CLI output unexpectedly.                                                                                                                          |
| Prompt   | `packages/runtime/src/prompt-engine.ts`, `context-files.ts`, `context-references.ts`, `skills/prompt.ts`                                   | `@aria/prompt`   | Prompt assembly already has a strong seam: it consumes config, memory, store, skill registry, and tool catalogs. Prefer moving the prompt builder as a package with explicit inputs rather than duplicating prompt text across callers.                                                                               |
| Tools    | `packages/runtime/src/tools/*`, `toolsets.ts`, `session-tool-environment.ts`, MCP-facing tool registration in `mcp.ts`                     | `@aria/tools`    | The runtime bootstrap in `runtime.ts` currently composes built-in tools, memory tools, skill tools, delegate tools, and MCP tools in one place. Phase 1 should preserve the existing tool catalog and approval UX while moving tool factories behind a dedicated package.                                             |
| Policy   | `packages/runtime/src/capability-policy.ts`, `security-mode.ts`, `path-boundary.ts`, `tools/policy.ts`, exec safety helpers under `tools/` | `@aria/policy`   | Policy is cross-cutting and should move with stable call signatures first. Keep approval behavior, capability decisions, URL/exec safety rules, and path-boundary enforcement behaviorally identical during extraction.                                                                                               |

## Recommended Extraction Order

1. `@aria/audit`
2. `@aria/store`
3. `@aria/prompt`
4. `@aria/policy`
5. `@aria/tools`
6. `@aria/protocol`

This order keeps low-level durable services moving before higher-level orchestration surfaces. It also keeps `procedures.ts` and runtime bootstrap code as temporary compatibility layers until the lower seams are package-owned.

## Review Hotspots

- `packages/server/src/runtime.ts` is now the live composition root. Keep `packages/runtime/src/runtime.ts` as a thin compatibility re-export while the remaining runtime-owned kernel submodules are moved or retired.
- `packages/runtime/package.json` exports are the public compatibility contract for Phase 1. Preserve those export paths with re-exports until downstream imports move.
- `packages/runtime/src/procedures.ts` is the highest-coupling file in the current runtime surface. Prefer moving helper modules under their target package boundaries before cutting over the router bindings themselves.

## Compatibility Rules

During Phase 1:

1. Keep existing `@aria/runtime` exports working, even if they become re-exports.
2. Do not change operator-visible storage paths such as `aria.db`, `audit.log`, archives, or checkpoint files.
3. Do not change CLI command names, default runtime-home behavior, or approval semantics as part of package moves.
4. Move implementation ownership first; delay broad renames or API redesign until the package seams are stable.

## Verification Checklist

Every extraction step should still pass:

- `bun run typecheck`
- `bun test`
- `bun run build`
- focused CLI/runtime smoke checks for audit, approvals, prompt assembly, and tool execution where the moved domain is involved

## Exit Condition

Phase 1 is complete when each listed domain has a package-owned implementation path, the repo can still build from the current CLI entrypoint, and `@aria/runtime` acts only as a compatibility surface around the remaining shared-kernel submodules.
