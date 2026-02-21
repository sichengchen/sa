---
id: 51
title: Add tsconfig path aliases for cross-boundary imports
status: done
type: feature
priority: 3
phase: 004-dx-distribution
branch: feature/004-dx-distribution
created: 2026-02-21
shipped_at: 2026-02-21
pr: https://github.com/sichengchen/sa/pull/9
---
# Add tsconfig path aliases for cross-boundary imports

## Context
SA has 4 subsystems (`engine/`, `connectors/`, `cli/`, `shared/`) with 37 cross-boundary relative imports using `../../engine/...` style paths. The codebase is clean (no circular deps) but the relative paths are fragile and hard to read. Bun natively supports tsconfig `paths` — no extra tooling needed.

Current tsconfig has no `baseUrl` or `paths` configured.

Ref: `.esper/explorations/001-turborepo-monorepo.md` (Approach C).

### Cross-boundary import counts
| From → To | Count |
|-----------|-------|
| `cli/` → `engine/` | 14 |
| `connectors/` → `shared/` | 8 |
| `connectors/` → `engine/` | 7 |
| `engine/` → `shared/` | 5 |
| `cli/` → `connectors/` | 2 |
| `shared/` → `engine/` | 1 |
| **Total** | **37** |

## Approach

### 1. Add path aliases to `tsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@sa/engine/*": ["src/engine/*"],
      "@sa/connectors/*": ["src/connectors/*"],
      "@sa/shared/*": ["src/shared/*"],
      "@sa/cli/*": ["src/cli/*"]
    }
  }
}
```

### 2. Update 37 cross-boundary imports
Replace relative paths with aliases. Examples:
- `../../engine/config/index.js` → `@sa/engine/config/index.js`
- `../../shared/client.js` → `@sa/shared/client.js`
- `../connectors/tui/client.js` → `@sa/connectors/tui/client.js`

Keep `.js` extensions (required by Bun's `moduleResolution: "bundler"` with ES modules).

Internal imports within the same subsystem stay relative (e.g., `./engine.js`, `../shared/fetch-models.js` inside `cli/`).

### 3. Update dynamic imports in engine/index.ts
The two dynamic connector imports also get aliases:
- `await import("../connectors/telegram/transport.js")` → `await import("@sa/connectors/telegram/transport.js")`
- `await import("../connectors/discord/transport.js")` → `await import("@sa/connectors/discord/transport.js")`

## Files to change

- `tsconfig.json` (modify — add `baseUrl` and `paths`)
- `src/cli/index.ts` (modify — 3 imports: 2 connectors, 1 engine)
- `src/cli/config/ConfigMenu.tsx` (modify — 2 imports)
- `src/cli/config/EnvironmentSettings.tsx` (modify — 3 imports)
- `src/cli/config/ConnectorSettings.tsx` (modify — 3 imports)
- `src/cli/config/MemorySettings.tsx` (modify — 1 import)
- `src/cli/config/ModelManager.tsx` (modify — 2 imports)
- `src/cli/config/ProviderManager.tsx` (modify — 3 imports)
- `src/cli/wizard/Wizard.tsx` (modify — 2 imports)
- `src/cli/wizard/steps/SkillSetup.tsx` (modify — 2 imports)
- `src/connectors/telegram/client.ts` (modify — 2 imports)
- `src/connectors/telegram/transport.ts` (modify — 2 imports)
- `src/connectors/tui/client.ts` (modify — 2 imports)
- `src/connectors/tui/App.tsx` (modify — 2 imports)
- `src/connectors/tui/ModelPicker.tsx` (modify — 1 import)
- `src/connectors/tui/SessionPicker.tsx` (modify — 1 import)
- `src/connectors/tui/MarkdownText.tsx` (modify — 1 import)
- `src/connectors/discord/client.ts` (modify — 2 imports)
- `src/connectors/discord/transport.ts` (modify — 2 imports)
- `src/engine/index.ts` (modify — 3 imports: 1 shared + 2 dynamic connector)
- `src/engine/sessions.ts` (modify — 1 import)
- `src/engine/server.ts` (modify — 1 import)
- `src/engine/procedures.ts` (modify — 1 import)
- `src/engine/config/types.ts` (modify — 1 import)
- `src/shared/client.ts` (modify — 1 import)

## Verification
- Run: `bun run typecheck` — all paths resolve, zero errors
- Run: `bun run lint` — no lint errors from new import style
- Run: `bun test` — all existing tests pass
- Run: `bun run dev` — app launches and connects to engine
- Edge cases: dynamic imports in `engine/index.ts` must resolve at runtime (Bun handles this natively with tsconfig paths)

## Progress
- Added `baseUrl` and `paths` to tsconfig.json with 4 aliases (@sa/engine/*, @sa/connectors/*, @sa/shared/*, @sa/cli/*)
- Updated 24 files across all 4 subsystems: cli/ (9 files), connectors/ (9 files), engine/ (5 files), shared/ (1 file)
- Replaced all cross-boundary relative imports with @sa/* aliases including 2 dynamic imports in engine/index.ts
- Modified: tsconfig.json + 24 source files
- Verification: typecheck pass, lint pass, 201 tests pass, build produces 7.11 MB binary
