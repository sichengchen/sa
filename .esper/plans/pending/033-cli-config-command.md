---
id: "033"
title: "sa config — interactive CLI configuration management"
status: pending
type: feature
priority: 2
phase: phase-2
branch: feature/phase-2
created: 2026-02-20
---

# sa config — interactive CLI configuration management

## Context

Configuration is currently split across two JSON files:
- `config.json` — runtime config (`SAConfig`: identity refs, activeModel, telegram env var, memory settings)
- `models.json` — provider & model registry (`ModelsFile` v2: providers[], models[], default)

Secrets stay in `secrets.enc` (encrypted). IDENTITY.md and USER.md are system-prompt injections, not configuration.

The only way to edit config today is re-running the full onboarding wizard (`sa onboard`), which walks through every step even if you just want to add a model. There's no targeted CLI for individual config changes.

### Key files
- `src/config/types.ts` — `SAConfig`, `RuntimeConfig`, `SecretsFile` types
- `src/config/manager.ts` — `ConfigManager` class (load, save, paths)
- `src/router/types.ts` — `ModelsFile`, `ModelConfig`, `ProviderConfig` types
- `src/router/router.ts` — `ModelRouter` class (loads models.json, CRUD, validation)
- `src/cli/index.ts` — CLI entry point with `COMMANDS` map
- `src/cli/wizard/Wizard.tsx` — writes config.json + models.json on confirm
- `src/cli/wizard/steps/ModelSetup.tsx` — provider selection, API key validation, model fetching
- `src/engine/runtime.ts` — bootstraps Engine from ConfigManager + ModelRouter

## Approach

### Part A: Merge models.json into config.json (schema v2 → v3)

1. **Extend `SAConfig` type** — add `providers: ProviderConfig[]`, `models: ModelConfig[]`, `defaultModel: string` fields to `SAConfig` (or a new top-level `SAConfigV3` with a `version` field). Remove `ModelsFile` as a separate schema.

2. **Update `ConfigManager`**:
   - `load()` reads a single config.json containing everything (providers, models, default, identity refs, runtime)
   - Add auto-migration: if `models.json` exists alongside config.json, merge it in and delete models.json
   - `getModelsPath()` → deprecated / removed (models are in config.json now)
   - Add `saveConfig()` method for full config persistence

3. **Update `ModelRouter`**:
   - Change `ModelRouter.load()` to accept the config object (or the models/providers subset) instead of a file path
   - Remove file I/O from ModelRouter — it becomes a pure in-memory router
   - Config persistence moves to ConfigManager

4. **Update all consumers**:
   - `engine/runtime.ts` — pass config data to ModelRouter instead of a file path
   - `cli/wizard/Wizard.tsx` — write merged config.json on confirm (no separate models.json)
   - `cli/index.ts` (`loadExistingConfig`) — read from single config.json

### Part B: `sa config` interactive CLI command

5. **Add `config` to CLI COMMANDS map** in `src/cli/index.ts`

6. **Create `src/cli/config/` directory** with Ink-based interactive screens:

   - **`ConfigMenu.tsx`** — top-level menu:
     ```
     SA Configuration
     ● Providers (1 configured)
     ○ Models (1 configured)
     ○ Default model: default
     ○ Telegram settings
     ○ Discord settings
     ○ Memory settings
     ```

   - **`ProviderManager.tsx`** — list providers → add / edit / remove
     - Add flow: select type (anthropic/openai/google/openrouter/openai-compat) → enter API key env var → optional base URL → validate key → save
     - Edit flow: select provider → edit fields → validate → save
     - Remove flow: select provider → confirm (block if models reference it)

   - **`ModelManager.tsx`** — list models → add / edit / remove / set default
     - Add flow: select provider → fetch available models from API → pick model → set name, temp, maxTokens → save
     - Edit flow: select model → edit fields → save
     - Remove flow: select model → confirm (block if it's the default)
     - Set default: select from existing models

   - **`ConnectorSettings.tsx`** — Telegram bot token, Discord token/guild, pairing code
     - Edit env var names and secrets

   - **`MemorySettings.tsx`** — toggle enabled, change directory

7. **Reuse existing wizard patterns**:
   - Reuse `ModelSetup.tsx`'s provider type selection, API key validation, and model fetching logic (extract into shared utilities)
   - Same `useInput` + arrow key navigation pattern used in `ModelPicker.tsx`
   - Use `Box` with `borderStyle` for section framing

8. **Engine restart hint**: After saving config changes, print a reminder: "Run `sa engine restart` to apply changes to the running Engine."

## Files to change

### Schema migration (Part A)
- `src/config/types.ts` (modify — add providers/models/defaultModel to SAConfig, add version field)
- `src/config/manager.ts` (modify — merge models into config.json, auto-migrate, remove getModelsPath)
- `src/config/defaults.ts` (modify — update default config to include providers/models)
- `src/router/router.ts` (modify — accept config data instead of file path, remove file I/O)
- `src/router/types.ts` (modify — keep ProviderConfig/ModelConfig, remove ModelsFile)
- `src/engine/runtime.ts` (modify — pass config data to ModelRouter)
- `src/cli/wizard/Wizard.tsx` (modify — write single config.json)
- `src/cli/index.ts` (modify — add config command, update loadExistingConfig)

### Interactive CLI (Part B)
- `src/cli/config/index.ts` (create — entry point, renders ConfigMenu)
- `src/cli/config/ConfigMenu.tsx` (create — top-level menu component)
- `src/cli/config/ProviderManager.tsx` (create — provider CRUD)
- `src/cli/config/ModelManager.tsx` (create — model CRUD + set default)
- `src/cli/config/ConnectorSettings.tsx` (create — telegram/discord settings)
- `src/cli/config/MemorySettings.tsx` (create — memory toggle/directory)
- `src/cli/config/shared.tsx` (create — reusable menu components, input fields)

### Shared utilities (extract from wizard)
- `src/cli/shared/provider-utils.ts` (create — provider type options, API key validation, model fetching — extracted from ModelSetup.tsx)

## Verification
- Run: `bun run typecheck && bun test`
- Expected: all types check, existing tests pass
- Manual verification:
  - `sa config` opens interactive menu, all sections navigable
  - Add a new provider → validates API key → persists to config.json
  - Add a model referencing new provider → fetches model list → persists
  - Remove provider blocked if models reference it
  - Remove model blocked if it's the default
  - Set default model works
  - After `sa engine restart`, engine picks up changes
  - Fresh install (no existing config) → `sa` runs wizard → writes merged config.json (no models.json)
  - Existing install with models.json → auto-migrated on next load
- Edge cases:
  - Migration from models.json v2 → merged config.json v3 (backward compat)
  - Config file doesn't exist yet (first run before wizard)
  - Concurrent engine running while editing config (engine uses old config until restart)
  - Provider with custom baseUrl (openai-compat) round-trips correctly
