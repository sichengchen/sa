---
id: 32
title: Split providers and models in config schema
status: done
type: feature
priority: 1
phase: phase-2
branch: feature/phase-2
created: 2026-02-20
shipped_at: 2026-02-20
---
# Split providers and models in config schema

## Context

Currently `models.json` stores a flat array where each model entry contains both provider details (`provider`, `apiKeyEnvVar`, `baseUrl`) and model details (`model`, `temperature`, `maxTokens`). This means if a user has multiple models on the same provider, they duplicate the provider config. The user wants a clean separation:

- **Providers** — configured once, referenced by ID
- **Models** — reference a provider by ID, contain only model-specific settings

Additionally, the TUI slash commands need updating:
- `/model` — switch between configured models (currently cosmetic-only, doesn't call engine)
- `/provider` — manage providers (add/list/remove)
- `/models` — manage models list (add/list/remove)

All management should go through tRPC so all connectors (TUI, Telegram, Discord) can use it.

The TUI slash command suggestions (in `Input.tsx`) are currently rendered horizontally — they should be vertical.

### Current schema (`models.json`)
```json
{
  "default": "sonnet",
  "models": [
    {
      "name": "sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250514",
      "apiKeyEnvVar": "ANTHROPIC_API_KEY",
      "temperature": 0.7,
      "maxTokens": 8192
    }
  ]
}
```

### New schema (`models.json`)
```json
{
  "version": 2,
  "default": "sonnet",
  "providers": [
    {
      "id": "anthropic-main",
      "type": "anthropic",
      "apiKeyEnvVar": "ANTHROPIC_API_KEY"
    },
    {
      "id": "openrouter",
      "type": "openrouter",
      "apiKeyEnvVar": "OPENROUTER_API_KEY"
    },
    {
      "id": "my-ollama",
      "type": "openai-compat",
      "apiKeyEnvVar": "OLLAMA_API_KEY",
      "baseUrl": "http://localhost:11434/v1"
    }
  ],
  "models": [
    {
      "name": "sonnet",
      "provider": "anthropic-main",
      "model": "claude-sonnet-4-5-20250514",
      "temperature": 0.7,
      "maxTokens": 8192
    }
  ]
}
```

### Relevant files
- `src/router/types.ts` — `ModelConfig`, `ModelsFile` types
- `src/router/router.ts` — `ModelRouter` class (load, getModel, switchModel, addModel, removeModel)
- `src/config/defaults.ts` — `DEFAULT_MODELS` constant
- `src/engine/router.ts` — tRPC endpoints (only `model.list` exists, returns `string[]`)
- `src/engine/runtime.ts` — runtime initialization, exposes `router`
- `src/connectors/tui/App.tsx` — `/model` slash command, `handleModelSelect` (cosmetic-only)
- `src/connectors/tui/Input.tsx` — slash command suggestions (horizontal layout, `SLASH_COMMANDS` list)
- `src/connectors/tui/ModelPicker.tsx` — model picker component
- `src/connectors/telegram/transport.ts` — `/model` command (read-only)
- `src/connectors/discord/transport.ts` — `/model` command (read-only)
- `src/wizard/` — wizard directory (will be moved to `src/cli/wizard/`)

### Known gaps in current code
- `model.switch` tRPC endpoint doesn't exist — TUI `handleModelSelect` only sets local state
- `model.add` / `model.remove` tRPC endpoints don't exist despite `ModelRouter` having the methods
- Telegram and Discord `/model` is display-only

## Approach

### 1. Update types (`src/router/types.ts`)

Add `ProviderConfig` interface and update `ModelConfig` / `ModelsFile`:

```typescript
export interface ProviderConfig {
  /** Unique ID for this provider configuration */
  id: string;
  /** LLM provider type (e.g. "anthropic", "openai", "openrouter") */
  type: KnownProvider;
  /** Environment variable name that holds the API key */
  apiKeyEnvVar: string;
  /** Base URL for OpenAI-compatible providers with custom endpoints */
  baseUrl?: string;
}

export interface ModelConfig {
  /** Display name for this model configuration */
  name: string;
  /** Provider ID (references ProviderConfig.id) */
  provider: string;
  /** Model ID within the provider (e.g. "claude-sonnet-4-5-20250514") */
  model: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
}

export interface ModelsFile {
  /** Schema version for future migration detection */
  version: number;
  /** Name of the default model config */
  default: string;
  /** Configured providers */
  providers: ProviderConfig[];
  /** Model configurations referencing providers by ID */
  models: ModelConfig[];
}
```

### 2. Update `ModelRouter` (`src/router/router.ts`)

- Update `load()` to validate both `providers` and `models` arrays, ensure referenced provider IDs exist
- Add `getProvider(id)` method to look up a `ProviderConfig` by ID
- Update `getModel()` to resolve provider from the model's `provider` field, then get `apiKeyEnvVar`, `baseUrl`, and `type` from the provider config
- Update `getStreamOptions()` similarly
- Add provider CRUD: `listProviders()`, `addProvider()`, `removeProvider()`
- Validate on remove: prevent removing a provider that's still referenced by models
- Validate `version` field on load — if missing or unrecognized, throw a clear error telling the user to re-run the wizard

### 3. Update defaults (`src/config/defaults.ts`)

Update `DEFAULT_MODELS` to the new schema format:

```typescript
export const DEFAULT_MODELS = {
  version: 2,
  default: "sonnet",
  providers: [
    {
      id: "anthropic",
      type: "anthropic",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
  ],
  models: [
    {
      name: "sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      temperature: 0.7,
      maxTokens: 8192,
    },
  ],
};
```

### 4. Add tRPC endpoints (`src/engine/router.ts`)

Expand the `model` namespace and add a `provider` namespace:

```
provider.list   → ProviderConfig[]
provider.add    → mutation (input: ProviderConfig)
provider.remove → mutation (input: { id: string })

model.list      → ModelConfig[]  (return full configs, not just names)
model.active    → query: { name: string }
model.switch    → mutation (input: { name: string })
model.add       → mutation (input: ModelConfig)
model.remove    → mutation (input: { name: string })
```

### 5. Update TUI slash commands (`src/connectors/tui/App.tsx`, `Input.tsx`)

**Slash commands:**
- `/model` — opens model picker to switch active model; on select, calls `model.switch` mutation
- `/provider` — shows provider list with option to add a new provider (opens a simple form)
- `/models` — shows model list with option to add/remove models

**Input.tsx changes:**
- Update `SLASH_COMMANDS` to include `/provider` and `/models`
- Change suggestion rendering from horizontal `<Box gap={1}>` to vertical (one per line, each in its own `<Box>`)

### 6. Update TUI model picker (`ModelPicker.tsx`)

- Accept full `ModelConfig[]` instead of `string[]` so it can display provider info alongside model name
- Show format like: `sonnet (anthropic → claude-sonnet-4-5-20250514)`

### 7. Update Telegram connector (`src/connectors/telegram/transport.ts`)

- `/model` — show current model, list available models, allow switching via inline keyboard buttons
- `/provider` — list configured providers

### 8. Update Discord connector (`src/connectors/discord/transport.ts`)

- `/model` — show current model, list available models, allow switching via buttons
- `/provider` — list configured providers

### 9. Move wizard into CLI (`src/wizard/` → `src/cli/wizard/`)

Move the entire `src/wizard/` directory under `src/cli/wizard/`:
- `src/wizard/Wizard.tsx` → `src/cli/wizard/Wizard.tsx`
- `src/wizard/index.ts` → `src/cli/wizard/index.ts`
- `src/wizard/steps/*` → `src/cli/wizard/steps/*`
- Update all imports referencing `../wizard/` or `../../wizard/` across the codebase (entry point `src/index.ts`, CLI `src/cli/index.ts`)

### 10. Update wizard for new schema (`src/cli/wizard/steps/ModelSetup.tsx`)

- Step now creates both a `ProviderConfig` and a `ModelConfig`
- Provider selection creates a provider entry (e.g. `{ id: "anthropic", type: "anthropic", apiKeyEnvVar: "ANTHROPIC_API_KEY" }`)
- Model selection creates a model entry referencing that provider
- `completeSetup` returns both provider and model data
- Update `ModelSetupData` interface to include provider config
- Update `Wizard.tsx` `handleConfirm` to write the new schema format

### 11. Schema version check (`src/router/router.ts`)

In `ModelRouter.load()`, check `version` field:
- If `version === 2`, proceed normally
- If missing or unrecognized, throw a descriptive error: `"models.json schema version unsupported — please re-run the onboarding wizard"`
- No auto-migration this time — the version field enables easier migration detection in future schema changes

## Files to change
- `src/router/types.ts` (modify — add `ProviderConfig`, update `ModelConfig` and `ModelsFile`)
- `src/router/router.ts` (modify — provider resolution, CRUD, migration logic)
- `src/config/defaults.ts` (modify — update `DEFAULT_MODELS` to new schema)
- `src/engine/router.ts` (modify — add `provider.*` and expand `model.*` tRPC endpoints)
- `src/connectors/tui/App.tsx` (modify — update slash command handling, call `model.switch` mutation)
- `src/connectors/tui/Input.tsx` (modify — add `/provider` to suggestions, render vertically)
- `src/connectors/tui/ModelPicker.tsx` (modify — accept full `ModelConfig[]`, show provider info)
- `src/connectors/telegram/transport.ts` (modify — model switching, provider list commands)
- `src/connectors/discord/transport.ts` (modify — model switching, provider list commands)
- `src/wizard/` → `src/cli/wizard/` (move — entire directory)
- `src/cli/wizard/steps/ModelSetup.tsx` (modify — output both provider and model config)
- `src/cli/wizard/Wizard.tsx` (modify — handle new `ModelSetupData` shape, write new schema)
- `src/index.ts` (modify — update wizard import path)
- `src/cli/index.ts` (modify — update wizard import path)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: All pass
- Live test: Start engine, connect TUI, verify:
  - `/model` opens picker and actually switches the engine's active model
  - `/provider` lists providers with add option
  - `/models` lists models with add/remove options
  - Slash command suggestions render vertically in TUI
  - Telegram `/model` shows list with switching
  - Old `models.json` (no version field) shows clear error directing user to re-run wizard
- Edge cases:
  - Cannot remove a provider that's referenced by a model
  - Cannot remove the default model
  - Missing or unrecognized `version` throws descriptive error
  - Empty providers array is invalid (must have at least one)

## Progress
- Implemented new `ProviderConfig` type, updated `ModelConfig` and `ModelsFile` to v2 schema
- Updated `ModelRouter` with provider resolution, CRUD methods (`addProvider`, `removeProvider`, `listProviders`), and schema version check
- Updated `DEFAULT_MODELS` in defaults to v2 format
- Added `provider.*` (list, add, remove) and expanded `model.*` (list, active, switch, add, remove) tRPC endpoints
- Updated TUI App.tsx with real `model.switch` mutation and `/provider` command, Input.tsx with vertical suggestions + new commands, ModelPicker.tsx to accept full `ModelConfig[]`
- Updated Telegram connector with model switching inline keyboard and provider list command
- Updated Discord connector with model switching buttons and provider list command
- Moved wizard from `src/wizard/` to `src/cli/wizard/`, fixed relative imports
- Updated wizard ModelSetup to emit `providerId`/`providerType`, Wizard.tsx handleConfirm to write v2 schema, cli/index.ts loadExistingConfig to read v2 schema
- Updated tests: router.test.ts and config-router.test.ts to v2 schema, agent.test.ts to v2 schema
- Modified: src/router/types.ts, src/router/router.ts, src/router/index.ts, src/config/defaults.ts, src/engine/router.ts, src/connectors/tui/App.tsx, src/connectors/tui/Input.tsx, src/connectors/tui/ModelPicker.tsx, src/connectors/telegram/transport.ts, src/connectors/discord/transport.ts, src/cli/wizard/ (moved from src/wizard/), src/cli/index.ts, tests/router.test.ts, tests/integration/config-router.test.ts, tests/agent.test.ts
- Verification: typecheck passed (pre-existing errors only), lint passed, tests 158 pass / 1 pre-existing fail (telegram @trpc/client missing)
