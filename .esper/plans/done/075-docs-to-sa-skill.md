---
id: 75
title: Comprehensive docs bundled in sa skill
status: done
type: feature
priority: 2
phase: 006-full-stack-polish
branch: feature/006-full-stack-polish
created: 2026-02-22
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/12
---
# Comprehensive docs bundled in sa skill

## Context
SA currently has 4 docs in `docs/` (architecture, configuration, tools, development — ~22 KB total) plus a 130-line `SKILL.md` in `src/engine/skills/bundled/sa/`. The docs and skill are maintained separately, leading to duplication and drift. Several areas lack documentation entirely (skills system, sessions, automation/cron, webhook, audio transcription, security/tool policy).

The bundled `sa` skill directory is already the agent-facing knowledge base. Making it the single source of truth for all project documentation eliminates the split and ensures the agent always has access to current docs via `read_skill` + `read`.

## Approach

### 1. Move and expand docs into the sa skill directory
Relocate `docs/*.md` into `src/engine/skills/bundled/sa/docs/` and expand each significantly:

**Existing docs (expand):**
- `architecture.md` — Add subsystem deep-dives (agent loop internals, model router flow, session lifecycle, system prompt assembly), update diagrams for 3-tier session model, automation, and webhook routes
- `configuration.md` — Add model tiers, task-tier mapping, model aliases, tool policy config, automation config (cron, webhook tasks, heartbeat), and full `config.json` annotated example
- `tools.md` — Add tool danger classification (safe/moderate/dangerous), 3-tier approval flow, per-tool config overrides, exec hybrid approval (filter patterns), tool policy verbosity
- `development.md` — Add testing strategy (unit vs integration vs live LLM), test helpers, CI/CD pipeline (CalVer, GitHub Actions, Homebrew tap), contributing guidelines, debugging tips

**New docs (create):**
- `skills.md` — Agent Skills spec overview, SKILL.md format with example, bundled vs user vs ClawHub skills, skill activation/deactivation, discovery catalog, `read_skill` usage, creating custom skills, `skill-creator` bundled skill
- `sessions.md` — Structured session ID format (`<prefix>:<id>`), 3-tier session model (main/connector/cron), SessionManager API, `/new` command, session lifecycle
- `automation.md` — Cron dispatch (scheduling, persistence, one-shot), heartbeat (HEARTBEAT.md checklist, smart suppression, main session), webhook-triggered tasks, automation logging, decision guide (heartbeat vs cron vs webhook)
- `security.md` — Tool danger levels, per-connector approval modes, exec hybrid approval, filter patterns, encrypted secrets vault, auth model (master token, device flow pairing), tool policy config

### 2. Update SKILL.md to reference the docs
Keep `SKILL.md` concise (the agent-facing skill entry point) but add a "Documentation" section that lists the available docs in the skill directory with brief descriptions. The agent can `read` any of them when deeper knowledge is needed:

```markdown
## Documentation

Detailed docs live alongside this skill in the `sa/docs/` directory. Use the `read` tool to access them:

| Doc | Path | Covers |
|-----|------|--------|
| Architecture | `src/engine/skills/bundled/sa/docs/architecture.md` | ... |
| Configuration | `src/engine/skills/bundled/sa/docs/configuration.md` | ... |
| ... | ... | ... |
```

### 3. Update README.md
Replace the `## Documentation` section links to point to the new location:
```markdown
## Documentation

- [Architecture](src/engine/skills/bundled/sa/docs/architecture.md)
- [Configuration](src/engine/skills/bundled/sa/docs/configuration.md)
- [Tools](src/engine/skills/bundled/sa/docs/tools.md)
- ...
```

### 4. Delete `docs/` directory
Remove the top-level `docs/` folder entirely. The sa skill directory is now the single source of truth.

### 5. Update CONSTITUTION.md
Add a principle about documentation maintenance:
```markdown
8. **Keep documentation current** — The `sa` bundled skill directory (`src/engine/skills/bundled/sa/`) is the single source of truth for all project documentation. When features are added or changed, update the relevant doc files. The `SKILL.md` stays concise (agent quick-reference); detailed docs live in `sa/docs/`.
```

### 6. Update embed-skills script to embed full docs
Update `scripts/embed-skills.ts` to embed all `.md` files in each skill directory (not just `SKILL.md`). In binary builds the source tree isn't on disk, so the agent needs embedded access to the doc files via `read`. The generated `embedded-skills.generated.ts` should store a map of `{ [relativePath]: content }` per skill (e.g. `{ "SKILL.md": "...", "docs/architecture.md": "...", ... }`). Update `loader.ts` to resolve `read` requests against embedded content when the filesystem path isn't available.

## Files to change
- `src/engine/skills/bundled/sa/docs/architecture.md` (create — expanded from `docs/architecture.md`)
- `src/engine/skills/bundled/sa/docs/configuration.md` (create — expanded from `docs/configuration.md`)
- `src/engine/skills/bundled/sa/docs/tools.md` (create — expanded from `docs/tools.md`)
- `src/engine/skills/bundled/sa/docs/development.md` (create — expanded from `docs/development.md`)
- `src/engine/skills/bundled/sa/docs/skills.md` (create — new)
- `src/engine/skills/bundled/sa/docs/sessions.md` (create — new)
- `src/engine/skills/bundled/sa/docs/automation.md` (create — new)
- `src/engine/skills/bundled/sa/docs/security.md` (create — new)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — add docs reference section)
- `README.md` (modify — update doc links to new paths)
- `docs/architecture.md` (delete)
- `docs/configuration.md` (delete)
- `docs/tools.md` (delete)
- `docs/development.md` (delete)
- `.esper/CONSTITUTION.md` (modify — add documentation principle)
- `scripts/embed-skills.ts` (modify — embed all .md files per skill directory, not just SKILL.md)
- `src/engine/skills/embedded-skills.generated.ts` (auto-generated — will include doc files)
- `src/engine/skills/loader.ts` (modify — resolve embedded doc files for binary builds)

## Verification
- Run: `bun run typecheck && bun run lint`
- Expected: Clean (no imports reference docs/)
- Verify: All README.md links resolve to existing files
- Verify: `scripts/embed-skills.ts` embeds all .md files (run `bun run build` and check generated file includes doc content)
- Verify: `docs/` directory no longer exists
- Verify: CONSTITUTION.md has the new documentation principle
- Verify: Each doc file is substantially more detailed than its predecessor (architecture ≥ 200 lines, configuration ≥ 250 lines, tools ≥ 200 lines, development ≥ 120 lines, new docs ≥ 100 lines each)
- Edge cases: Ensure no other files in the repo reference `docs/` paths (grep for broken links)

## Progress
- Created 8 comprehensive doc files in src/engine/skills/bundled/sa/docs/ (4205 lines total): architecture (830), configuration (780), tools (590), development (376), skills (314), sessions (273), automation (354), security (688)
- Updated SKILL.md with Documentation reference table
- Updated README.md links to new doc paths
- Added documentation principle #8 to CONSTITUTION.md
- Rewrote embed-skills.ts to embed all .md files per skill directory (Record<string, Record<string, string>> format)
- Updated loader.ts with parseEmbeddedSkills multi-file support, loadEmbeddedDoc, listEmbeddedFiles
- Updated Wizard.tsx for new embedded skills format (writes all .md files, not just SKILL.md)
- Regenerated embedded-skills.generated.ts (22 files across 12 skills)
- Deleted docs/ directory
- Verification: typecheck clean, lint clean, 441 pass / 9 skip / 0 fail, build succeeds (10.38 MB)
- Modified: 8 new doc files, SKILL.md, README.md, CONSTITUTION.md, embed-skills.ts, loader.ts, embedded-skills.generated.ts, Wizard.tsx, deleted 4 old doc files
