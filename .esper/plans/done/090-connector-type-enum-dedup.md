---
id: 90
title: fix: ConnectorType Zod enum missing 'cron' and duplicated across modules
status: done
type: fix
priority: 1
phase: 007-memory-redesign
branch: fix/connector-type-enum-dedup
created: 2026-02-23
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/23
---
# fix: ConnectorType Zod enum missing 'cron' and duplicated across modules

## Context

`src/shared/types.ts:24` defines:
```ts
export type ConnectorType = "tui" | "telegram" | "discord" | "webhook" | "engine" | "cron";
```

But `src/engine/procedures.ts` contains two separate inline Zod enum validators (lines ~440 and ~661):
```ts
z.enum(["tui", "telegram", "discord", "webhook", "engine"])
```

Both are missing `"cron"`. This means:
- Any tRPC call that passes `connectorType: "cron"` will be **silently rejected** by Zod schema validation — the error propagates as a tRPC validation error, not a meaningful runtime message.
- The cron connector cannot create sessions via the standard `session.create` procedure, forcing it to bypass the API or use internal workarounds.
- Duplication means future connector types (e.g., `"cli"`, `"api"`) will require updates in multiple places — a fragile contract.

The audit flags this as **[HIGH] breaking change risk** because the TypeScript type and the runtime Zod schema are out of sync, which TypeScript's type checker cannot catch (the Zod enum is constructed from string literals at runtime).

## Approach

1. In `src/shared/types.ts` (or a new `src/shared/zod.ts`), export a shared Zod enum derived from the same source of truth:
   ```ts
   export const ConnectorTypeSchema = z.enum(["tui", "telegram", "discord", "webhook", "engine", "cron"]);
   export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;
   ```
2. Replace both inline `z.enum([...])` calls in `procedures.ts` with `ConnectorTypeSchema`.
3. Remove the manual `type ConnectorType` union from `types.ts` and re-export `ConnectorType` from the Zod inference — single source of truth.
4. Update any imports of `ConnectorType` across `src/` to use the new location if it moves.

## Files to change

- [src/shared/types.ts](src/shared/types.ts) (modify — replace manual union type with `z.infer<typeof ConnectorTypeSchema>`)
- [src/engine/procedures.ts](src/engine/procedures.ts) (modify — import and use `ConnectorTypeSchema` at lines ~440, ~661)
- Any connector files importing `ConnectorType` directly (modify — update import paths as needed)

## Verification

- Run: `bun run typecheck` — must pass with no errors
- Run: `bun run lint` — must pass
- Run: `bun test` — full suite must pass
- Regression check: verify cron session creation works end-to-end; verify existing connector types (tui, telegram, discord) still validate correctly

## Progress
- Added `ConnectorTypeSchema` Zod enum to `src/shared/types.ts` as single source of truth (includes all 6 types including "cron")
- Derived `ConnectorType` from `z.infer<typeof ConnectorTypeSchema>` — replaces manual union
- Replaced both inline `z.enum([...])` in `procedures.ts` with imported `ConnectorTypeSchema`
- All existing `import type { ConnectorType }` statements work unchanged
- Modified: src/shared/types.ts, src/engine/procedures.ts
- Verification: 535 tests pass, lint clean, typecheck clean
