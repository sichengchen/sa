---
id: 31
title: Add OpenRouter as a built-in provider
status: done
type: feature
priority: 2
phase: phase-2
branch: feature/phase-2
created: 2026-02-20
shipped_at: 2026-02-20
---
# Add OpenRouter as a built-in provider

**Depends on:** #032 (provider/model config split) — must be implemented first.

## Context

SA's wizard currently offers 4 provider options: Anthropic, OpenAI, Google, and generic OpenAI-compatible. PI-mono (`@mariozechner/pi-ai`) already supports `"openrouter"` as a `KnownProvider`, so the Router/Agent layer requires no changes — only the wizard and model-fetching logic need updating.

After #032 lands, the config schema separates providers and models. Adding OpenRouter means adding it to the wizard's `PROVIDER_OPTIONS` so users can select it during onboarding or via `/provider` in the TUI, which will create a `ProviderConfig` entry with `type: "openrouter"`.

**Relevant files:**
- `src/wizard/steps/ModelSetup.tsx` — provider picker, credential collection, model fetching, and model selection
- `src/router/types.ts` — `ProviderConfig.type` uses `KnownProvider` from PI-mono (already includes `"openrouter"`)
- `src/router/router.ts` — `ModelRouter.getModel()` already handles any `KnownProvider` via PI-mono's `getModel()`

**OpenRouter API details:**
- Base URL: `https://openrouter.ai/api/v1`
- Auth: `Authorization: Bearer <key>` header
- Model list: `GET /models` returns `{ data: { id: string, name: string, ... }[] }` (OpenAI-compatible format)
- Chat completions: OpenAI-compatible at `/chat/completions`
- Env var convention: `OPENROUTER_API_KEY`

## Approach

### 1. Update `ProviderType` union
Add `"openrouter"` to the `ProviderType` type alias in `ModelSetup.tsx`.

### 2. Add to `PROVIDER_OPTIONS`
Insert OpenRouter as the 4th option (before OpenAI-compatible), with:
- `type: "openrouter"`
- `label: "OpenRouter"`
- `apiKeyEnvVar: "OPENROUTER_API_KEY"`

### 3. Add `fetchModelList` branch
Add an `"openrouter"` case that fetches from `https://openrouter.ai/api/v1/models` using Bearer auth. The response format matches OpenAI's `{ data: { id: string }[] }` structure.

### 4. Verify `completeSetup` compatibility
After #032, `completeSetup` creates a `ProviderConfig` with `type: providerOption.type`. For OpenRouter:
- `type: "openrouter"` (PI-mono recognized `KnownProvider`)
- `apiKeyEnvVar: "OPENROUTER_API_KEY"`
- No `baseUrl` needed (PI-mono knows OpenRouter's base URL)

No special-casing needed in `completeSetup`.

## Files to change
- `src/wizard/steps/ModelSetup.tsx` (modify — add `"openrouter"` to ProviderType, PROVIDER_OPTIONS, and fetchModelList)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: All pass with no errors
- Live test: Configure OpenRouter with a real API key, verify model list fetches and a chat completion works end-to-end
- Edge cases:
  - OpenRouter model list may return hundreds of models — verify scrollable picker handles large lists (already supports scroll with VISIBLE_MODELS=8)
  - API key validation — empty key should gracefully fall back to manual model entry (existing error handling covers this)

## Progress
- Added `"openrouter"` to `ProviderType` union in `ModelSetup.tsx`
- Added OpenRouter entry to `PROVIDER_OPTIONS`: `{ type: "openrouter", label: "OpenRouter", apiKeyEnvVar: "OPENROUTER_API_KEY" }`
- Added `fetchModelList` branch for `"openrouter"` using OpenAI-compatible `/models` endpoint at `https://openrouter.ai/api/v1/models` with Bearer auth
- `completeSetup` works correctly for OpenRouter without any special-casing (not compat, so uses standard flow)
- Modified: src/cli/wizard/steps/ModelSetup.tsx
- Verification: typecheck passed (no new errors), lint passed, tests 158 pass / 1 pre-existing fail
