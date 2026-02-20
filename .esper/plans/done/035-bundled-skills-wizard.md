---
id: 35
title: Bundled skills library & wizard skill picker
status: done
type: feature
priority: 2
phase: phase-2
branch: feature/phase-2
created: 2026-02-20
shipped_at: 2026-02-20
---
# Bundled skills library & wizard skill picker

## Context

The wizard currently has a SkillSetup step with two options: "Browse skills after setup" (ClawHub) or "Skip". Plan #034 removes ClawHub from the wizard entirely. This plan replaces that step with a multi-select skill picker showing all bundled skills, and adds 10 new bundled skills to the library.

**Current wizard step order**: Welcome → Identity → Profile → Model → Telegram → Discord → Skills → Confirm → Done

**Current bundled skills**: Only `skill-creator` exists at `src/engine/skills/bundled/skill-creator/SKILL.md`.

**Skill registry**: `SkillRegistry.loadAll()` auto-discovers all `SKILL.md` files under `src/engine/skills/bundled/` — no manual registration needed. Adding a directory with a valid `SKILL.md` is enough.

**Skills to bundle** (fetched from upstream repos):

| # | Name | Description | Source |
|---|------|-------------|--------|
| 1 | pinchtab | Control Chrome browser via Pinchtab HTTP API | pinchtab/pinchtab |
| 2 | apple-mail-search | Search Apple Mail via SQLite queries | openclaw: mneves75 |
| 3 | apple-contacts | Query macOS Contacts via AppleScript | openclaw: tyler6204 |
| 4 | apple-notes | Manage Apple Notes via `memo` CLI | openclaw: steipete |
| 5 | apple-calendar | Manage macOS Calendar via AppleScript | openclaw: tyler6204 |
| 6 | homeassistant-skill | Control Home Assistant via REST API | openclaw: anotb |
| 7 | apple-reminders | Manage Apple Reminders via `remindctl` CLI | openclaw: steipete |
| 8 | 1password | 1Password CLI secret management | openclaw: steipete |
| 9 | weather | Weather lookups via wttr.in + Open-Meteo | openclaw: steipete |
| 10 | sa | Self-referential skill about the SA project | new (created by us) |

## Approach

### 1. Add 9 upstream bundled skills

For each of the 9 external skills, create `src/engine/skills/bundled/<name>/SKILL.md` with the content fetched from the upstream repos. Preserve original frontmatter and instructions verbatim — these are community skills and should stay faithful to the upstream.

Directory structure after:
```
src/engine/skills/bundled/
├── skill-creator/SKILL.md
├── pinchtab/SKILL.md
├── apple-mail-search/SKILL.md
├── apple-contacts/SKILL.md
├── apple-notes/SKILL.md
├── apple-calendar/SKILL.md
├── homeassistant-skill/SKILL.md
├── apple-reminders/SKILL.md
├── 1password/SKILL.md
├── weather/SKILL.md
└── sa/SKILL.md
```

### 2. Create the `sa` self-referential skill

Create `src/engine/skills/bundled/sa/SKILL.md` — a skill that teaches SA about itself: its architecture (Engine + Connectors), config location (`~/.sa/`), available slash commands, how to check its own health, and how to guide users through common SA tasks. Include a note in the frontmatter or body that this skill should be updated as SA evolves.

### 3. Update CONSTITUTION.md

Add a principle or note under the existing Principles section: "Keep the bundled `sa` skill (`src/engine/skills/bundled/sa/SKILL.md`) up to date as architecture and features evolve."

### 4. Redesign SkillSetup wizard step

Replace the current SkillSetup step (binary "browse ClawHub / skip") with a multi-select checklist:

- List all bundled skills by name + short description
- All skills default to **selected** (opt-out model — most users want all bundled skills)
- User navigates with ↑↓, toggles with Space, confirms with Enter
- Selected skills get activated in the skill registry on wizard completion
- `WizardData.installSkills` changes from `boolean` to `string[]` (list of selected skill names)

**UI sketch**:
```
  Bundled Skills

  Choose which skills to activate. You can change this later.

  [x] skill-creator    — Create new agent skills
  [x] sa               — Knowledge about SA itself
  [x] pinchtab         — Control Chrome browser via Pinchtab
  [x] apple-notes      — Manage Apple Notes via memo CLI
  [x] apple-calendar   — Manage macOS Calendar via AppleScript
  [x] apple-contacts   — Query macOS Contacts via AppleScript
  [x] apple-reminders  — Manage Apple Reminders via remindctl
  [x] apple-mail-search— Search Apple Mail via SQLite
  [x] 1password        — 1Password CLI secret management
  [x] weather          — Weather lookups via wttr.in
  [x] homeassistant    — Control Home Assistant via REST API

  ↑↓ navigate · Space toggle · Enter confirm
```

### 5. Wire wizard data to skill activation

In the wizard's `handleConfirm()` (Confirm.tsx), after writing config files, activate the selected skills in the SkillRegistry. This means:
- Read the `string[]` of selected skill names from `WizardData`
- For each, call `registry.activate(name)` or write a config entry to `~/.sa/config.json` that the Engine reads on startup to know which skills are active

### 6. Update Confirm step summary

Add a "Skills" section to the Confirm summary showing how many skills were selected and their names.

## Files to change

- `src/engine/skills/bundled/pinchtab/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/apple-mail-search/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/apple-contacts/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/apple-notes/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/apple-calendar/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/homeassistant-skill/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/apple-reminders/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/1password/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/weather/SKILL.md` (create — bundled skill)
- `src/engine/skills/bundled/sa/SKILL.md` (create — self-referential skill)
- `src/cli/wizard/steps/SkillSetup.tsx` (modify — replace with multi-select picker)
- `src/cli/wizard/steps/Confirm.tsx` (modify — update WizardData type, add skills summary)
- `src/cli/wizard/Wizard.tsx` (modify — pass bundled skill list to SkillSetup, handle string[] data)
- `.esper/CONSTITUTION.md` (modify — add note about keeping `sa` skill updated)

## Verification

- Run: `bun run typecheck`
- Expected: No type errors (WizardData change from `boolean` to `string[]`)
- Run: `bun test`
- Expected: All tests pass
- Manual: Run wizard (`sa --setup`), verify SkillSetup shows all 11 bundled skills as checkboxes
- Manual: Toggle some skills off, complete wizard, verify only selected skills are active
- Manual: Verify Confirm step shows selected skill count and names
- Edge cases:
  - Deselect all skills — should still complete wizard (empty array is valid)
  - Re-run wizard — should show previously selected skills as pre-checked
  - SkillRegistry should still auto-discover all bundled SKILL.md files regardless of wizard selection (selection controls activation, not discovery)

## Progress
- Added 9 upstream bundled skills from verbatim source content (pinchtab, apple-mail-search, apple-contacts, apple-notes, apple-calendar, apple-reminders, 1password, weather, homeassistant-skill)
- Created self-referential `sa` bundled skill documenting SA architecture, commands, and config
- Updated CONSTITUTION.md with principle #6: keep sa skill up to date
- Redesigned SkillSetup wizard step as multi-select checklist using scanSkillDirectory for discovery
- Changed WizardData.installSkills (boolean) to selectedSkills (string[]) — opt-out model (all selected by default)
- Updated Confirm step to show selected skill count and names
- Modified: SkillSetup.tsx, Confirm.tsx, Wizard.tsx, CONSTITUTION.md
- Created: 10 SKILL.md files under src/engine/skills/bundled/
- Verification: typecheck passed, 176 tests passed (0 failures), lint passed
