---
id: 005
title: Identity & configuration system
status: pending
type: feature
priority: 2
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Identity & configuration system

## Context
SA stores its identity (name, personality, system prompt) in a Markdown file and runtime configuration in JSON files. This is the "configuration as documents" principle — human-readable, version-controllable, and easy to edit by hand.

## Approach
1. Define the config directory structure:
   - `~/.sa/` — user's SA home directory (or configurable via `SA_HOME` env var)
   - `~/.sa/identity.md` — Markdown file with agent name, personality, system prompt
   - `~/.sa/config.json` — runtime config (active model, Telegram token ref, memory settings)
   - `~/.sa/models.json` — model configurations (used by router)
2. Create `identity.md` template:
   ```markdown
   # SA (Sasa)
   ## Personality
   [description of how the agent should behave]
   ## System Prompt
   [the actual system prompt sent to the LLM]
   ```
3. Implement `ConfigManager` class:
   - `load()` — reads all config files from SA_HOME
   - `save()` — writes config files back
   - `getIdentity()` — parses identity.md and returns structured data
   - `getConfig()` / `setConfig(key, value)` — JSON config CRUD
4. Config is loaded once at startup and passed to Agent and Router
5. Write unit tests with a temp SA_HOME directory

## Files to change
- `src/config/types.ts` (create — config type definitions)
- `src/config/manager.ts` (create — ConfigManager implementation)
- `src/config/defaults.ts` (create — default identity.md and config.json templates)
- `src/config/index.ts` (create — barrel export)
- `tests/config.test.ts` (create — unit tests)

## Verification
- Run: `bun test tests/config.test.ts`
- Expected: config loads from directory, identity.md is parsed correctly, config CRUD works, defaults are applied when files are missing
- Edge cases: missing SA_HOME directory (should create), corrupted JSON, missing identity.md (use defaults)
