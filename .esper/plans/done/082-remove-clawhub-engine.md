---
id: 82
title: fix: Remove ClawHub integration from engine (keep bundled skills)
status: done
type: fix
priority: 2
phase: 006-full-stack-polish
branch: fix/remove-clawhub-engine
created: 2026-02-22
shipped_at: 2026-02-22
pr: 18
---
# fix: Remove ClawHub integration from engine (keep bundled skills)

## Context

The `src/engine/clawhub/` module provides an HTTP client, type definitions, and a skill installer for the ClawHub registry (clawhub.ai). This integration is no longer needed in the engine core. The bundled `clawhub` skill (in `src/engine/skills/bundled/clawhub/`) should be preserved — it provides the user-facing ClawHub scripts and can be maintained independently.

The engine-side code to remove consists of:
- `src/engine/clawhub/client.ts` — HTTP client class
- `src/engine/clawhub/types.ts` — API response types
- `src/engine/clawhub/installer.ts` — install/uninstall logic + local registry
- `src/engine/clawhub/index.ts` — barrel export

Plus references scattered in procedures, tests, docs, and generated embeddings.

## Approach

1. **Delete `src/engine/clawhub/` directory** — remove all 4 files (client, types, installer, index)
2. **Update `src/engine/procedures.ts`** — remove or reword the ClawHub comment on the `skill.reload` procedure (the procedure itself stays, it's useful for any skill reload)
3. **Delete `tests/clawhub.test.ts`** — the entire test file tests the removed module
4. **Update `src/engine/skills/prompt.test.ts`** — remove or update the `clawhub_search` reference in skill prompt tests (adjust assertion to match remaining skills)
5. **Update `CLAUDE.md`** — remove `clawhub/` from the architecture diagram
6. **Grep for stragglers** — search for any remaining `clawhub` imports/references outside bundled skills and clean them up

## Files to change

- `src/engine/clawhub/` (delete — entire directory)
- `tests/clawhub.test.ts` (delete — tests the removed module)
- `src/engine/procedures.ts` (modify — remove ClawHub comment from reload procedure)
- `src/engine/skills/prompt.test.ts` (modify — update test referencing clawhub_search)
- `CLAUDE.md` (modify — remove clawhub/ from architecture diagram)

## Verification

- Run: `bun run typecheck` — project compiles with no errors
- Run: `bun test` — all remaining tests pass
- Run: `grep -r 'clawhub' src/ tests/ --include='*.ts' | grep -v 'skills/bundled'` — no remaining references outside bundled skills
- Regression check: engine starts cleanly, skill reload procedure still works
