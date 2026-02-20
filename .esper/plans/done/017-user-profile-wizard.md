---
id: "017"
title: Ask user for personalization (USER.md injection) during onboarding
status: done
shipped_at: 2026-02-19
type: feature
priority: 2
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Ask user for personalization (USER.md injection) during onboarding

## Context
Plan #16 bootstrapped `~/.sa/USER.md` as a static template with empty placeholder sections (About Me, Preferences, Recurring Context). The user is expected to hand-edit it later, but most won't bother — meaning the agent has zero user context on first launch.

The wizard already collects agent identity (name + personality) in `src/wizard/steps/Identity.tsx`. There is no step that asks about the **user**. The system prompt assembly in `src/index.ts` already injects USER.md content under `## User Profile`, so any content written during the wizard will be immediately available to the agent.

### Relevant files
- `src/wizard/Wizard.tsx` — step flow, `Step` type, `WizardData`, `handleConfirm()` writes USER.md template
- `src/wizard/steps/Identity.tsx` — agent identity step (pattern reference)
- `src/wizard/steps/Confirm.tsx` — exports `WizardData` interface, summary display
- `src/wizard/steps/Welcome.tsx` — setup checklist text
- `src/config/manager.ts` — `loadUserProfile()` reads `~/.sa/USER.md`

## Approach

### 1. Create `src/wizard/steps/UserProfile.tsx`
New wizard step following the existing step component pattern:
- **Fields:** user name (required), timezone (optional), communication style (optional — concise/detailed/casual selector), freeform "about me" (optional)
- User name: text input, cannot advance with empty value (show hint)
- Timezone: text input with placeholder hint like "e.g. America/New_York"
- Communication style: cycle selector (Enter to advance, Tab or arrow to cycle between options: concise / detailed / casual / skip)
- About me: text input, skip with Enter
- Supports Keep/Change gate for re-setup (`--setup` flag), same pattern as Identity.tsx

### 2. Wire into `Wizard.tsx`
- Add `"profile"` to the `Step` union type, between `"identity"` and `"model"`
- Add profile fields to `WizardData`: `userName: string`, `timezone: string`, `communicationStyle: string`, `aboutMe: string`
- Handle `onNext` from UserProfile — merge data and advance to `"model"`
- Handle `onBack` from UserProfile — go to `"identity"`
- Update back-navigation from `"model"` to go to `"profile"` instead of `"identity"`

### 3. Update `handleConfirm()` USER.md generation
Replace the static template with content populated from collected data:
```markdown
# User Profile

## About Me
Name: {userName}
Timezone: {timezone or "not set"}
{aboutMe text if provided}

## Preferences
Communication style: {communicationStyle or "not set"}

## Recurring Context
<!-- Add ongoing projects, goals, or context Sasa should always be aware of. -->
```
Keep the `existsSync` guard so re-setup doesn't overwrite a hand-edited USER.md — but when the user explicitly goes through the profile step on re-setup, **do** overwrite with the new data (merge: keep any `## Recurring Context` content the user added manually, replace the rest).

### 4. Update `Confirm.tsx` summary
Add a "User profile" section to the confirmation screen showing collected profile fields (name, timezone, style).

### 5. Update `Welcome.tsx` checklist
Add a line item mentioning user profile setup in the welcome screen's setup checklist.

## Files to change
- `src/wizard/steps/UserProfile.tsx` (create — new wizard step component)
- `src/wizard/Wizard.tsx` (modify — add step to flow, wire data, update USER.md generation)
- `src/wizard/steps/Confirm.tsx` (modify — extend WizardData, show profile in summary)
- `src/wizard/steps/Welcome.tsx` (modify — add profile mention to checklist)

## Verification
- Run: `bun test`
- Expected: all existing tests pass, no regressions
- Manual verification:
  - Fresh setup (`rm -rf ~/.sa && bun run src/index.ts`): profile step appears after Identity, name is required, other fields skippable, USER.md is populated with entered data
  - Re-setup (`bun run src/index.ts --setup`): profile step shows Keep/Change gate with current values
  - Skip all optional fields: USER.md still created with name and "not set" placeholders
  - Agent system prompt includes the populated USER.md content
- Edge cases:
  - Empty name should not allow advancing (show validation hint)
  - Very long "about me" text should not break the TUI layout
  - Existing hand-edited USER.md Recurring Context section preserved on re-setup

## Progress
- Milestones: 5 commits
- Modified: src/wizard/steps/UserProfile.tsx (create), src/wizard/Wizard.tsx, src/wizard/steps/Confirm.tsx, src/wizard/steps/Welcome.tsx, src/index.ts
- Verification: 93 tests passing, typecheck clean — run /esper:finish to verify and archive
