---
id: 81
title: Convert ClawHub tools to bundled skill
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
---
# Convert ClawHub tools to bundled skill

## Context

ClawHub integration currently lives in two places:
- **Built-in tools** (`src/engine/tools/clawhub-search.ts`, `clawhub-install.ts`, `clawhub-update.ts`) — registered as engine-level tools alongside core tools like `exec`, `remember`, `notify`
- **ClawHub skill** (`src/engine/skills/bundled/clawhub/SKILL.md`) — a thin instruction document that tells the agent how to use the built-in tools

The API client and installer logic (`src/engine/clawhub/`) are fine as-is — they're library code, not tool definitions.

The problem: ClawHub tools are registered as built-in engine tools, but they're not core engine functionality. They're a skill-level concern (marketplace browsing/installation). Other similar integrations (weather, apple-notes, etc.) are pure skills that use `exec` for their scripts. ClawHub should follow the same pattern.

### Current tool signatures
- `clawhub_search(query: string)` → safe, searches registry
- `clawhub_install(slug: string, version?: string)` → moderate, downloads + installs skill
- `clawhub_update(slug?: string)` → moderate, checks/applies updates

### Current registration
In `runtime.ts`, the tools are created via factory functions that receive `saHome` and the `SkillRegistry` instance so they can reload skills after install/update.

## Approach

### 1. Create TypeScript scripts under the ClawHub bundled skill

Move the tool logic into standalone scripts that the agent can invoke via `exec`:

- `src/engine/skills/bundled/clawhub/scripts/search.ts` — accepts query arg, calls `ClawHubClient.search()`, prints formatted results
- `src/engine/skills/bundled/clawhub/scripts/install.ts` — accepts slug + optional version, calls `SkillInstaller.install()`, prints result
- `src/engine/skills/bundled/clawhub/scripts/update.ts` — accepts optional slug, checks/applies updates, prints result

Scripts use the existing `ClawHubClient` and `SkillInstaller` from `src/engine/clawhub/` — no duplication. They read `SA_HOME` from env (already injected at engine startup).

**Key difference from old tools**: After install/update, the scripts cannot directly call `skills.loadAll()` to reload the registry. Instead, the engine needs a lightweight reload mechanism. Options:
- The script prints a signal (e.g., `[RELOAD_SKILLS]`) and the agent/engine watches for it — too fragile.
- Add a `POST /reload-skills` HTTP endpoint or tRPC procedure — clean, the SKILL.md can instruct the agent to call it after install.
- **Simplest**: Add a `reload_skills` tRPC procedure. The SKILL.md instructs the agent to hit it after any install/update. This keeps scripts stateless.

### 2. Update SKILL.md to be self-contained

Rewrite `src/engine/skills/bundled/clawhub/SKILL.md` to include:
- Full instructions for search, install, update workflows
- Script invocation commands (via `exec`)
- Post-install reload instruction (call `reload_skills` procedure or just document that skills auto-reload on next agent session)

### 3. Remove built-in ClawHub tools

- Delete `src/engine/tools/clawhub-search.ts`, `clawhub-install.ts`, `clawhub-update.ts`
- Remove exports from `src/engine/tools/index.ts`
- Remove factory calls and imports from `src/engine/runtime.ts`

### 4. Add skill reload mechanism

Add a lightweight way to reload skills without restarting the engine:
- Option A: tRPC `skills.reload` procedure (cleanest)
- Option B: File watcher on `~/.sa/skills/` (over-engineered)
- **Go with Option A**: Add `skills.reload` to procedures.ts — calls `skills.loadAll()`, returns updated skill count

### 5. Update tests

- Migrate tool-level tests from `tests/clawhub.test.ts` — the client and installer tests stay, the tool tests get replaced with script tests
- Add tests for the new `skills.reload` procedure

### 6. Update documentation

- Update `src/engine/skills/bundled/sa/docs/tools.md` — remove ClawHub tools from the built-in tools table
- Update `src/engine/skills/bundled/sa/docs/skills.md` — update ClawHub skill description to reflect it's now fully self-contained
- Update `src/engine/skills/bundled/sa/SKILL.md` if it references ClawHub tools

## Files to change

- `src/engine/skills/bundled/clawhub/scripts/search.ts` (create — standalone search script)
- `src/engine/skills/bundled/clawhub/scripts/install.ts` (create — standalone install script)
- `src/engine/skills/bundled/clawhub/scripts/update.ts` (create — standalone update script)
- `src/engine/skills/bundled/clawhub/SKILL.md` (modify — rewrite with exec-based instructions)
- `src/engine/tools/clawhub-search.ts` (delete)
- `src/engine/tools/clawhub-install.ts` (delete)
- `src/engine/tools/clawhub-update.ts` (delete)
- `src/engine/tools/index.ts` (modify — remove ClawHub exports)
- `src/engine/runtime.ts` (modify — remove ClawHub tool creation + imports)
- `src/engine/procedures.ts` (modify — add `skills.reload` procedure)
- `tests/clawhub.test.ts` (modify — remove tool tests, add script/procedure tests)
- `src/engine/skills/bundled/sa/docs/tools.md` (modify — remove ClawHub from built-in tools table)
- `src/engine/skills/bundled/sa/docs/skills.md` (modify — update ClawHub skill docs)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — update if references ClawHub tools)

## Verification

- Run: `bun test`, `bun run typecheck`, `bun run lint`
- Expected: All pass, no regressions
- Manual: Start engine, activate clawhub skill, run search/install/update via exec — confirm they work
- Edge cases:
  - Install a skill, verify `skills.reload` makes it immediately available
  - Update with no updates available — should report cleanly
  - Search with no results — should report cleanly
  - Scripts should handle missing `SA_HOME` gracefully
