---
id: 63
title: Test infrastructure + guidance
status: done
type: feature
priority: 1
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Test infrastructure + guidance

## Context
SA has 23 test files (~218 test cases, ~39% file coverage) but no shared test helpers — each test creates its own temp dirs, factories, and setup boilerplate. There are zero live LLM tests; the agent chat loop (P0 gap) and tRPC API surface are completely untested. No `tests/helpers/` directory exists. tsconfig paths (`@sa/engine/*`, etc.) are defined but tests use relative imports.

Existing patterns: temp dirs via `join(tmpdir(), "sa-test-*-" + Date.now())` in `beforeEach`/`afterEach`; `Bun.serve()` as mock HTTP server; `Type.Object()` for tool parameter schemas.

## Approach

### 1. Create `tests/helpers/temp-dir.ts`
Shared temp directory lifecycle helper:
```ts
export function withTempDir(fn: (getDir: () => string) => void): void
```
Creates a unique dir in `beforeEach`, cleans up in `afterEach`. Extracts the pattern already used in 7+ test files.

### 2. Create `tests/helpers/live-model.ts`
Live LLM test infrastructure:
```ts
export const LIVE = !!process.env.ANTHROPIC_API_KEY;
export function makeLiveRouter(): ModelRouter  // Haiku, maxTokens: 128, temperature: 0
export function describeLive(name: string, fn: () => void): void  // describe.if(LIVE) wrapper
```
Uses `ModelRouter.fromConfig()` with a minimal config pointing to `claude-3-5-haiku-20241022`.

### 3. Create `tests/helpers/test-tools.ts`
Simple test tools for exercising tool dispatch without side effects:
```ts
export const echoTool: ToolImpl      // returns { content: args.message }
export const failTool: ToolImpl      // always throws
export const slowTool: ToolImpl      // delays N ms then returns
```
Each has `dangerLevel: "safe"`, proper pi-ai `Type.Object()` parameters.

### 4. Create `TESTING.md`
Agent-readable testing guidance at project root. Content based on exploration 004's draft: quick reference commands, rules (every new file gets tests, test behavior not implementation, live LLM tests for agent behavior), where to put tests, live test patterns, unit test patterns, what NOT to test.

### 5. Update `CONSTITUTION.md`
Add a line under "Testing Strategy" referencing `TESTING.md`: "See `TESTING.md` for detailed testing guidance and patterns."

## Files to change
- `tests/helpers/temp-dir.ts` (create — shared temp directory helper)
- `tests/helpers/live-model.ts` (create — live LLM model factory)
- `tests/helpers/test-tools.ts` (create — echo/fail/slow test tools)
- `tests/helpers/helpers.test.ts` (create — tests for the helpers themselves)
- `TESTING.md` (create — agent-readable testing guide)
- `.esper/CONSTITUTION.md` (modify — reference TESTING.md)

## Verification
- Run: `bun test tests/helpers/helpers.test.ts`
- Expected: Helper tests pass (temp-dir lifecycle, test tool execution, live-model setup skips without key)
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Edge cases: `makeLiveRouter()` should throw a clear error if called without `ANTHROPIC_API_KEY`; `describeLive` should skip gracefully

## Progress
- Implemented shared temp-dir helper with beforeEach/afterEach lifecycle
- Implemented live-model helper with LIVE flag, makeLiveRouter(), describeLive()
- Implemented test-tools: echoTool, failTool, slowTool with proper Type.Object() params
- Created comprehensive helpers.test.ts (10 pass, 1 skip)
- Created TESTING.md agent-readable testing guide based on exploration 004
- Updated CONSTITUTION.md with TESTING.md reference
- Modified: tests/helpers/temp-dir.ts, tests/helpers/live-model.ts, tests/helpers/test-tools.ts, tests/helpers/helpers.test.ts, TESTING.md, .esper/CONSTITUTION.md
- Verification: all tests pass (321 pass, 1 skip), typecheck clean, lint clean
