---
id: 87
title: Redesign onboarding wizard and config editor for model types + tier routing
status: done
type: feature
priority: 2
phase: 007-memory-redesign
branch: feature/007-memory-redesign
created: 2026-02-22
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/20
---
# Redesign onboarding wizard and config editor for model types + tier routing

## Context

The onboarding wizard (`src/cli/wizard/steps/ModelSetup.tsx`, 363 lines) only sets up a single provider + single model. Users have no way to configure:
- Multiple models for different tiers (performance/normal/eco)
- Embedding models for memory vector search
- Tier assignments (currently config.json-only, no UI)
- Model aliases (currently config.json-only, no UI)

The config editor's model panel (`src/cli/config/ModelManager.tsx`, 359 lines) lets you add/remove models and set a default, but:
- Adding a model doesn't ask what type (chat vs embedding)
- No tier assignment UI — models are flat list with no role context
- No way to see or change which model serves which tier

This plan unblocks embedding model configuration needed for Plan 085 (vector embeddings + hybrid search).

### Current wizard model setup flow (Step 4):
```
Keep-or-change → Provider Select → Credentials → Fetch Models → Model Select
```

### Current config editor model panel:
```
Models list → Add (provider → fetch → select → name/temp/maxTokens) | Delete | Set default
```

### Key files:
- `src/cli/wizard/steps/ModelSetup.tsx` — Wizard model setup (8 substeps)
- `src/cli/wizard/Wizard.tsx` — Wizard orchestrator (saves config on completion)
- `src/cli/config/ModelManager.tsx` — Config editor model management
- `src/cli/config/ConfigMenu.tsx` — Config editor main menu
- `src/cli/shared/fetch-models.ts` — Shared model list fetcher
- `src/engine/router/types.ts` — `ModelConfig`, `ProviderConfig`
- `src/engine/router/task-types.ts` — `ModelTier`, `TaskType`
- `src/engine/config/types.ts` — `RuntimeConfig` (modelTiers, modelAliases)

## Approach

### 1. Add `type` field to ModelConfig

In `src/engine/router/types.ts`, add optional `type` to `ModelConfig`:

```typescript
interface ModelConfig {
  name: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  fallback?: string;
  type?: "chat" | "embedding";  // default: "chat"
}
```

Backward compatible — existing models without `type` are treated as `"chat"`.

### 2. Redesign onboarding wizard model step

Replace the single-model ModelSetup with a multi-step flow:

```
Step 4: Model Setup
  4a. Primary model (same flow as today)
      → Provider select → Credentials → Fetch → Model select
      → Auto-assigned as default + performance tier

  4b. "Add an eco model for lightweight tasks?" [Y/N]
      If yes:
        → If same provider has cheaper models: show filtered list
        → If different provider needed: provider select → credentials → fetch → select
        → Auto-assigned to eco tier
      If no: skip (all tiers default to primary model)

  4c. "Add an embedding model for memory search?" [Y/N]
      If yes:
        → Provider select (reuse existing or add new)
        → Fetch embedding models (filter by type where API supports it)
        → Model select
        → Saved with type: "embedding"
      If no: skip (memory search uses BM25-only)
```

Implementation: Refactor `ModelSetup.tsx` into a multi-phase component. Each sub-step (4a/4b/4c) uses the same provider→fetch→select flow but with different context messaging. Extract the shared model-selection flow into a reusable `ModelPicker` component.

### 3. Update WizardData and save logic

Expand `WizardData` to carry multiple models:

```typescript
interface WizardData {
  // ... existing fields (identity, profile, etc.)

  // Primary model (replaces single model fields)
  primaryModel: {
    providerId: string;
    providerType: string;
    model: string;
    apiKeyEnvVar: string;
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
  };

  // Optional eco model
  ecoModel?: {
    providerId: string;
    providerType: string;
    model: string;
    apiKeyEnvVar: string;
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
  };

  // Optional embedding model
  embeddingModel?: {
    providerId: string;
    providerType: string;
    model: string;
    apiKeyEnvVar: string;
    apiKey: string;
    baseUrl?: string;
  };
}
```

Update `Wizard.tsx` save logic (lines 52-165) to:
- Write multiple models to `config.json` models array
- Set `modelTiers` in runtime config if eco model was added
- Write embedding model with `type: "embedding"`
- Deduplicate providers (if eco/embedding use same provider as primary)

### 4. Extract shared ModelPicker component

Create `src/cli/shared/ModelPicker.tsx` — a reusable Ink component encapsulating:
- Provider selection (from existing providers or "add new")
- API key entry (if new provider)
- Model list fetching
- Paginated model selection (or manual entry fallback)
- Name/temperature/maxTokens fields (for chat models only)

Both wizard and config editor use this component. This eliminates the duplicate selection code between `ModelSetup.tsx` and `ModelManager.tsx`.

### 5. Redesign config editor Models panel

Replace flat model list with a type-first menu:

```
Models
  > Chat models          3 configured
  > Embedding models     1 configured
```

**Chat models sub-screen:**
```
Chat Models
  sonnet (anthropic/claude-sonnet-4-5) *default  [performance]
  haiku (anthropic/claude-haiku-3-5)              [eco]
  + Add chat model
  ─────────────────
  Tier Assignments
    performance → sonnet     (Enter to change)
    normal → sonnet          (Enter to change)
    eco → haiku              (Enter to change)
```

- Selecting a model: Enter → set as default, `d` → delete, `t` → assign to tier
- Adding a chat model: ModelPicker flow → after adding, prompt "Assign to a tier?" → performance/normal/eco/skip
- Tier Assignments row: Enter → shows list of existing chat models to pick from
- `d` on a tier assignment → reset to default model

**Embedding models sub-screen:**
```
Embedding Models
  embed (openai/text-embedding-3-small)
  + Add embedding model
```

- Only one embedding model needed (first one found is used by memory search)
- Adding: ModelPicker flow (skips temperature/maxTokens fields — not relevant for embeddings)
- `d` → delete (memory search falls back to BM25-only)

**Where things live (single source of truth):**
- Embedding model: configured ONLY in Models panel (not in Memory settings)
- Tier assignments: configured ONLY in Models > Chat models (not a separate screen)
- Memory settings: shows enabled/disabled, directory, journal, search params — no embedding config

### 7. Update Confirm step

Update `src/cli/wizard/steps/Confirm.tsx` summary to show:
- Primary model (with tier label)
- Eco model (if added, with tier label)
- Embedding model (if added)

### 8. Backward compatibility

- Existing `config.json` with no `type` on models → all treated as `"chat"`
- Existing `config.json` with no `modelTiers` → all tiers default to active model (unchanged)
- Wizard re-run (`sa onboard`) on existing config → keep-or-change flow works with new multi-model format
- Old WizardData format (single model fields) → migration handled in Wizard.tsx

## Files to change

- `src/engine/router/types.ts` (modify — add `type?: "chat" | "embedding"` to ModelConfig)
- `src/cli/shared/ModelPicker.tsx` (create — reusable model selection component)
- `src/cli/wizard/steps/ModelSetup.tsx` (rewrite — multi-model flow with primary/eco/embedding)
- `src/cli/wizard/steps/Confirm.tsx` (modify — show multiple models in summary)
- `src/cli/wizard/Wizard.tsx` (modify — update WizardData type, save logic for multiple models/tiers)
- `src/cli/config/ModelManager.tsx` (rewrite — categorized view, tier assignments, model type)
- `src/cli/config/MemorySettings.tsx` (modify — expand memory config: journal toggle, search params)
- `src/cli/config/ConfigMenu.tsx` (modify — update Models subtitle to show type counts)
- `tests/config-wizard.test.ts` (create — test wizard save logic with multi-model configs)

## Verification

- Run: `bun run dev -- onboard` (manual — walk through new wizard flow)
- Expected: Can set up primary + eco + embedding models in one pass
- Run: `bun run dev -- config` (manual — verify new Models panel)
- Expected: Models categorized by type, tier assignments visible and editable
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Run: `bun test tests/config-wizard.test.ts`
- Expected: Save logic correctly writes multi-model config
- Edge cases:
  - Skip eco model → all tiers default to primary (no modelTiers in config)
  - Skip embedding model → memory search uses BM25-only
  - Same provider for all models → single provider entry, not duplicated
  - Re-run wizard on existing multi-model config → keep-or-change works per model
  - Existing single-model config → backward compatible, no type field needed
  - Delete the only chat model → blocked (must have at least one)
  - Delete embedding model → memory falls back to BM25

## Progress
- Created shared ModelPicker component (src/cli/shared/ModelPicker.tsx) with full provider→credentials→fetch→select flow
- Rewrote ModelSetup.tsx for multi-model wizard: primary → ask eco? → eco → ask embedding? → embedding
- Updated WizardData with ecoModel/embeddingModel fields, Wizard.tsx save logic with provider deduplication and modelTiers
- Updated Confirm.tsx to show all 3 models with tier labels
- Rewrote ModelManager.tsx with type categories (chat/embedding), tier assignment UI
- Expanded MemorySettings.tsx with journal toggle, search params, vector weight, temporal decay
- Updated ConfigMenu.tsx to show model type counts
- Created tests/config-wizard.test.ts (8 tests) for multi-model config generation
- Modified: src/cli/shared/ModelPicker.tsx, src/cli/wizard/steps/ModelSetup.tsx, src/cli/wizard/steps/Confirm.tsx, src/cli/wizard/Wizard.tsx, src/cli/config/ModelManager.tsx, src/cli/config/MemorySettings.tsx, src/cli/config/ConfigMenu.tsx
- Verification: 513 tests pass, typecheck clean, lint clean
