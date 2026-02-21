---
id: 44
title: Add Nvidia NIM as a built-in provider
status: done
type: feature
priority: 2
phase: phase-3
branch: feature/phase-3
created: 2026-02-21
shipped_at: 2026-02-21
---
# Add Nvidia NIM as a built-in provider

## Context
SA supports 5 provider types: anthropic, openai, google, openrouter, openai-compat (`src/cli/shared/fetch-models.ts`). Nvidia NIM (integrate.api.nvidia.com) uses an OpenAI-compatible API at `https://integrate.api.nvidia.com/v1`. Adding it as a named built-in provider improves discoverability — users won't need to manually configure openai-compat with a base URL.

## Approach

1. **Add "nvidia" to ProviderType** — extend the `ProviderType` union in `src/cli/shared/fetch-models.ts` and any corresponding type in config types.

2. **Add Nvidia model fetching** — in `fetchModelList`, add a case for `"nvidia"` that hits `https://integrate.api.nvidia.com/v1/models` with `Bearer` auth (same pattern as openai-compat but with the known base URL).

3. **Add to wizard provider options** — in the wizard ModelSetup screen, add Nvidia as a selectable provider with:
   - Default env var: `NVIDIA_API_KEY`
   - Default base URL: `https://integrate.api.nvidia.com/v1`

4. **Add to config CLI** — ensure the ProviderManager screen in `sa config` lists nvidia as a known provider type.

## Files to change
- `src/cli/shared/fetch-models.ts` (modify — add "nvidia" case to fetchModelList)
- `src/cli/wizard/ModelSetup.tsx` (modify — add nvidia to PROVIDER_OPTIONS)
- `src/cli/config/ProviderManager.tsx` (modify — add nvidia as known type)
- `src/engine/config/defaults.ts` (modify — add nvidia default provider config if needed)

## Verification
- Run: `bun test && bun run typecheck`
- Expected: Type checks pass; nvidia appears in wizard and config provider lists
- Edge cases: API key env var must be configurable (not all users use NVIDIA_API_KEY); model listing should handle Nvidia's specific response format if it differs

## Progress
- Added "nvidia" to ProviderType in fetch-models.ts, ModelSetup.tsx, ProviderManager.tsx
- Added nvidia case in fetchModelList hitting integrate.api.nvidia.com/v1/models
- Added Nvidia NIM to wizard PROVIDER_OPTIONS with NVIDIA_API_KEY default
- Added Nvidia NIM to config PROVIDER_TYPES
- Modified: src/cli/shared/fetch-models.ts, src/cli/wizard/steps/ModelSetup.tsx, src/cli/config/ProviderManager.tsx
- Verification: typecheck passed, lint passed, 201 tests passed
