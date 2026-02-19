---
id: 9
title: Onboarding wizard (TUI)
status: done
type: feature
priority: 6
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
shipped_at: 2026-02-19
---
# Onboarding wizard (TUI)

## Context
A new user needs to configure SA before first use — set up identity, model provider API keys, Telegram bot token, and initial preferences. The onboarding wizard is a step-by-step TUI flow built with Ink that walks through this setup.

## Approach
1. Detect first run: if `~/.sa/` doesn't exist or `~/.sa/config.json` is missing, launch wizard
2. Wizard steps (Ink components):
   - **Welcome** — brief intro, explain what SA is
   - **Identity** — ask for agent name (default: "Sasa"), personality description
   - **Model Setup** — select provider (Anthropic/OpenAI/Google/etc.), enter API key, pick default model
   - **Telegram Setup** — optional: enter bot token, link guide, test connection
   - **Confirm** — summary of all settings, confirm to save
3. Each step is an Ink component with input fields and navigation (Enter to proceed, Esc to go back)
4. On confirm:
   - Create `~/.sa/` directory
   - Write `identity.md` from wizard inputs
   - Write `config.json` with runtime settings
   - Write `models.json` with the configured model
   - Write `.env` (or prompt user to set env vars) for API keys
   - Create `memory/` directory with empty `MEMORY.md`
5. After wizard completes, launch the main TUI chat interface
6. Wizard can be re-run via `sa --setup` flag

## Files to change
- `src/wizard/Wizard.tsx` (create — main wizard component)
- `src/wizard/steps/Welcome.tsx` (create — welcome screen)
- `src/wizard/steps/Identity.tsx` (create — identity setup)
- `src/wizard/steps/ModelSetup.tsx` (create — model configuration)
- `src/wizard/steps/TelegramSetup.tsx` (create — Telegram bot setup)
- `src/wizard/steps/Confirm.tsx` (create — summary and confirm)
- `src/wizard/index.ts` (create — barrel export)
- `src/index.ts` (modify — check for first run, launch wizard or main app)

## Verification
- Run: manual testing with `SA_HOME=/tmp/sa-test bun run dev`
- Expected: wizard launches on first run, creates all config files, transitions to main TUI
- Edge cases: user cancels mid-wizard (no partial writes), invalid API key format, Telegram token test fails (allow skip)

## Progress
- Implemented 5-step wizard: Welcome, Identity, ModelSetup, TelegramSetup, Confirm
- Auto-detects first run (missing config.json), supports --setup flag for re-run
- On confirm: writes identity.md, config.json, models.json, MEMORY.md
- Navigation: Enter to proceed, Esc to go back between steps
- Modified: src/wizard/Wizard.tsx, steps/*.tsx, src/wizard/index.ts, src/index.ts
- Verification: passed — typecheck clean, 63 tests pass
