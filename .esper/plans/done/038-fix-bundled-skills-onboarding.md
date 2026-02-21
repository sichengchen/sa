---
id: 38
title: fix: copy selected bundled skills to ~/.sa/skills/ during onboarding
status: done
type: fix
priority: 1
phase: phase-2
branch: fix/bundled-skills-onboarding
created: 2026-02-20
shipped_at: 2026-02-21
---
# fix: copy selected bundled skills to ~/.sa/skills/ during onboarding

## Context

The wizard's SkillSetup step lets the user pick which bundled skills to enable, and the Confirm step displays the selection — but `handleConfirm` in `Wizard.tsx` never copies them to `~/.sa/skills/`. The `selectedSkills` array is collected, shown, and then silently dropped.

At runtime, `SkillRegistry.loadAll()` scans both `src/engine/skills/bundled/` and `~/.sa/skills/`. Because nothing is ever written to the user dir, the selection has no effect — all bundled skills are always discovered from the bundled source directory regardless.

The fix: during onboarding, copy each selected bundled skill's directory (containing `SKILL.md`) into `~/.sa/skills/{skill-name}/`.

## Approach

1. **`Wizard.tsx` — `handleConfirm`** (after config.json write, before `setStep("done")`):
   - `mkdir ~/.sa/skills/` (recursive)
   - For each skill name in `data.selectedSkills`:
     - Resolve the bundled source: `BUNDLED_SKILLS_DIR/{name}/SKILL.md`
     - Copy the entire skill directory to `~/.sa/skills/{name}/`
   - Use `node:fs/promises` `cp` with `{ recursive: true }` to copy directories (handles future skills that may contain more than just SKILL.md)

2. **Import `BUNDLED_SKILLS_DIR`** from the skill loader/registry (already exported from `src/engine/skills/registry.ts` or define the constant).

## Files to change

- `src/cli/wizard/Wizard.tsx` (modify — add skill copy logic in `handleConfirm`)
- `src/engine/skills/registry.ts` or `src/engine/skills/loader.ts` (modify — export `BUNDLED_SKILLS_DIR` if not already exported)

## Verification

- Run `sa onboard` (or delete `~/.sa/config.json` to trigger first-run)
- Select a subset of skills in the wizard
- After wizard completes, check `~/.sa/skills/` — only selected skills should be present
- Start the engine and confirm `read_skill` works for installed skills
- `bun run typecheck` passes

## Progress
- Milestones: 1 commit
- Modified: `src/engine/skills/registry.ts`, `src/cli/wizard/Wizard.tsx`
- Verification: not yet run — run /esper:finish to verify and archive
