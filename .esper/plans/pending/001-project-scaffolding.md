---
id: 001
title: Project scaffolding
status: pending
type: feature
priority: 1
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Project scaffolding

## Context
The repo is empty — just a git init and `.claude/` directory. We need the full project skeleton before any feature work can begin.

## Approach
1. Run `bun init` to create `package.json` and `tsconfig.json`
2. Install core dependencies: `ink`, `react`, `@mariozechner/pi-ai`, `grammy` (or `telegraf`), and dev deps (`@types/react`, `typescript`, `prettier`, `eslint`)
3. Configure `tsconfig.json` for strict mode, JSX (react-jsx), ES2022 target, Bun module resolution
4. Set up directory structure:
   - `src/` — all source code
   - `src/agent/` — core agent runtime
   - `src/router/` — model router
   - `src/tools/` — built-in tools
   - `src/memory/` — long-term memory
   - `src/tui/` — Ink TUI components
   - `src/telegram/` — Telegram bot transport
   - `src/config/` — configuration loading/saving
   - `src/wizard/` — onboarding wizard
   - `tests/` — test files
5. Add `package.json` scripts: `dev`, `build`, `test`, `lint`, `typecheck`
6. Create a minimal `src/index.ts` entry point
7. Create `.gitignore` for `node_modules/`, `dist/`, `.env`
8. Create `.env.example` with placeholder keys

## Files to change
- `package.json` (create — project manifest)
- `tsconfig.json` (create — TypeScript config)
- `.gitignore` (create — ignore patterns)
- `.env.example` (create — environment variable template)
- `src/index.ts` (create — entry point)

## Verification
- Run: `bun install && bun run typecheck`
- Expected: clean install, no type errors
- Edge cases: ensure PI-mono packages resolve correctly via Bun
