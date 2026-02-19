---
id: 002
title: Model router with PI-mono integration
status: pending
type: feature
priority: 2
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Model router with PI-mono integration

## Context
SA needs a model router that wraps PI-mono's `@mariozechner/pi-ai` to provide multi-provider LLM access. The router must support storing multiple model configurations (name, provider, model ID, API key reference, parameters) and switching between them instantly.

## Approach
1. Define a `ModelConfig` type: `{ name, provider, model, apiKeyEnvVar, temperature, maxTokens, ... }`
2. Create a `models.json` config file schema that stores an array of model configs and a `default` field
3. Implement `ModelRouter` class:
   - `constructor(configPath)` — loads models.json
   - `getModel(name?)` — returns a PI-mono LLM client for the named (or default) config
   - `listModels()` — returns all configured model names
   - `switchModel(name)` — changes the active model
   - `addModel(config)` / `removeModel(name)` — CRUD on configs
4. Wrap PI-mono's provider initialization so API keys are read from environment variables
5. Write unit tests for config loading, model switching, and invalid config handling

## Files to change
- `src/router/types.ts` (create — ModelConfig type definitions)
- `src/router/router.ts` (create — ModelRouter implementation)
- `src/router/index.ts` (create — barrel export)
- `tests/router.test.ts` (create — unit tests)

## Verification
- Run: `bun test tests/router.test.ts`
- Expected: all tests pass — config loading, model switching, error on unknown model
- Edge cases: missing API key env var, empty models.json, duplicate model names
