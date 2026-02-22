---
id: 66
title: Migrate imports to path aliases
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Migrate imports to path aliases

## Context
tsconfig.json already defines path aliases (`@sa/engine/*`, `@sa/connectors/*`, `@sa/shared/*`, `@sa/cli/*`) and Bun natively resolves tsconfig paths. However, all 65+ cross-boundary imports still use relative paths (e.g., `../../engine/config/types.js` instead of `@sa/engine/config/types.js`). This makes imports fragile and harder to read.

Within-package imports (e.g., `engine/agent/agent.ts` importing from `engine/tools/exec.ts`) should stay as relative paths — aliases are for cross-boundary imports only.

## Approach

### 1. Identify all cross-boundary imports
Scan `src/` for import statements that cross package boundaries:
- `src/cli/` importing from `../engine/` or `../shared/` or `../connectors/`
- `src/connectors/` importing from `../engine/` or `../shared/`
- `src/engine/` importing from `../shared/` (if any)
- `tests/` importing from `../src/engine/`, `../src/shared/`, etc.

### 2. Add test path alias
Add `"@sa/tests/*": ["tests/*"]` to tsconfig paths if test files need cross-referencing. More importantly, add test import aliases so tests can do `@sa/engine/...` instead of `../../src/engine/...`.

### 3. Migrate imports mechanically
Replace each relative cross-boundary import with the corresponding alias:
- `../../engine/foo.js` → `@sa/engine/foo.js`
- `../../shared/types.js` → `@sa/shared/types.js`
- `../connectors/shared/...` → `@sa/connectors/shared/...`

Preserve `.js` extensions (required for ESM resolution with Bun).

### 4. Verify nothing breaks
Run typecheck, lint, tests, and `bun run build` to ensure all aliases resolve correctly at both type-check time and runtime.

## Files to change
- `tsconfig.json` (modify — potentially add test alias)
- `src/cli/**/*.ts` (modify — ~20 files with cross-boundary imports)
- `src/connectors/**/*.ts` (modify — ~16 files with cross-boundary imports)
- `src/engine/**/*.ts` (modify — any files importing from shared)
- `tests/**/*.ts` (modify — all test files importing from src/)

## Verification
- Run: `bun run typecheck`
- Expected: Clean — all aliases resolve
- Run: `bun run lint`
- Expected: Clean
- Run: `bun test`
- Expected: All existing tests pass
- Run: `bun run build`
- Expected: Bundle succeeds
- Edge cases: Bun resolves tsconfig paths at runtime; verify `bun run dev` also works. Check that `.js` extensions are preserved in alias imports.

## Progress
- Migrated 56 cross-boundary imports across 20 test files from relative paths to @sa/* aliases
- 54 @sa/engine/*, 1 @sa/shared/*, 1 @sa/connectors/*
- Kept within-package relative imports (test helpers, cli internal, connector internal)
- Modified: 22 files in tests/
- Verification: 362 pass, 9 skip, 0 fail; typecheck clean; lint clean; build succeeds
