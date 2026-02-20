---
id: 30
title: Wizard updates for Phase 2
status: done
type: feature
priority: 3
phase: phase-2
branch: feature/phase-2
created: 2026-02-19
shipped_at: 2026-02-20
---
# Wizard updates for Phase 2

## Context
The onboarding wizard (`src/wizard/`) currently sets up identity, model, Telegram, and user profile. Phase 2 adds Discord and skills, and the Engine replaces the monolithic process. The wizard needs updates to:
1. Configure Discord bot token and channel
2. Explain the Engine architecture to new users
3. Optionally browse/install starter skills from ClawHub

The wizard uses Ink step components (`Welcome.tsx`, `Identity.tsx`, `ModelSetup.tsx`, `TelegramSetup.tsx`, `UserProfile.tsx`, `Confirm.tsx`).

## Approach
1. Create `src/wizard/steps/DiscordSetup.tsx` — Discord configuration step:
   - Ask for Discord bot token (or env var name)
   - Ask for allowed guild ID and channel ID
   - Option to create Discord bot (link to Discord developer portal)
   - Store token in encrypted secrets
2. Create `src/wizard/steps/SkillSetup.tsx` — skill discovery step:
   - Show a curated list of popular/recommended skills from ClawHub
   - Let user select skills to pre-install
   - Search ClawHub for specific skills
   - Skip option for users who don't want skills yet
3. Update `src/wizard/steps/Welcome.tsx`:
   - Explain Engine + Connector architecture briefly
   - Mention that SA now runs as a background service
4. Update `src/wizard/Wizard.tsx`:
   - Add DiscordSetup step after TelegramSetup
   - Add SkillSetup step after UserProfile
   - Update step count and progress indicator
5. Update `src/wizard/steps/Confirm.tsx`:
   - Show Discord config summary
   - Show installed skills summary
   - Add "Start Engine" option after wizard completion
6. Update `src/config/types.ts`:
   - Add Discord config fields to `RuntimeConfig`
   - Add skills config to `SAConfig`
7. Update wizard's `onComplete` handler to start the Engine after setup

## Files to change
- `src/wizard/steps/DiscordSetup.tsx` (create — Discord configuration step)
- `src/wizard/steps/SkillSetup.tsx` (create — skill discovery and installation step)
- `src/wizard/steps/Welcome.tsx` (modify — update intro text for Engine architecture)
- `src/wizard/Wizard.tsx` (modify — add new steps)
- `src/wizard/steps/Confirm.tsx` (modify — show Discord and skills summary)
- `src/config/types.ts` (modify — add Discord and skills config)
- `src/wizard/index.ts` (modify — export updated types)

## Verification
- Run: `bun run src/index.ts --setup` — wizard includes Discord and Skill steps
- Expected: User can configure Discord bot, browse/install skills, wizard completes and starts Engine
- Edge cases: Skip Discord (optional), skip skills, re-run wizard with existing Discord config (Keep/Change gate)

## Progress
- Created src/wizard/steps/DiscordSetup.tsx with token + guild ID input, keep/change gate for re-setup
- Created src/wizard/steps/SkillSetup.tsx with starter skill list and browse/skip selection
- Updated src/wizard/steps/Welcome.tsx with Engine+Connector architecture intro and 6-step list
- Updated src/wizard/Wizard.tsx with discord and skills steps in the flow, default data fields
- Updated src/wizard/steps/Confirm.tsx with Discord and Skills summary sections, WizardData extended
- Updated src/config/types.ts with discordToken and discordGuildId in SecretsFile
- Modified: DiscordSetup.tsx, SkillSetup.tsx, Welcome.tsx, Wizard.tsx, Confirm.tsx, config/types.ts
- Verification: 163 tests pass, typecheck clean, lint clean
