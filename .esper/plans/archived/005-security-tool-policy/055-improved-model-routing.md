---
id: 55
title: Task-tier model routing
status: done
type: feature
priority: 2
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# Task-tier model routing

## Context
The `ModelRouter` in `src/engine/router/router.ts` has a simple model: one active model for everything. All tasks — chat, tool use, exec classification, summarization — go through the same model. This is wasteful: a simple exec classification doesn't need Opus, and a hard reasoning task shouldn't be stuck on Haiku.

Currently `ModelRouter.getModel(name?)` accepts an optional model name, but there's no concept of task-based routing. The router has `activeModelName` and `defaultModelName` — that's it.

## Approach

### Step 1: Define 3 model tiers
Add a `ModelTier` type and tier-to-model mapping in `RuntimeConfig`:

```typescript
type ModelTier = "performance" | "normal" | "eco";

interface RuntimeConfig {
  // ...existing fields...
  /** Map each tier to a configured model name */
  modelTiers?: Record<ModelTier, string>;
}
```

Semantics:
- **performance**: chat, tool use, and reasoning — the primary user-facing tasks (e.g., Opus, Sonnet)
- **normal**: moderate tasks if the user wants a middle tier (e.g., Sonnet, GPT-4o)
- **eco**: lightweight internal tasks — exec classification, summarization, simple lookups (e.g., Haiku, Flash)

Default mapping: `{ performance: <activeModel>, normal: <activeModel>, eco: <activeModel> }` — all tiers point to the active model until the user configures them. This means zero behavior change for unconfigured users.

### Step 2: Define task types and their default tiers
Create `src/engine/router/task-types.ts`:

```typescript
type TaskType =
  | "chat"              // regular conversation → performance
  | "tool_use"          // tool dispatch loop → performance
  | "reasoning"         // complex multi-step analysis → performance
  | "classification"    // exec command classification → eco
  | "summarization"     // internal summarization → eco
  | "transcription"     // audio transcription routing → eco

const DEFAULT_TASK_TIER: Record<TaskType, ModelTier> = {
  chat: "performance",
  tool_use: "performance",
  reasoning: "performance",
  classification: "eco",
  summarization: "eco",
  transcription: "eco",
};
```

Users can override the task-to-tier mapping in config:
```json
{
  "runtime": {
    "modelTiers": {
      "performance": "opus",
      "normal": "sonnet",
      "eco": "haiku"
    },
    "taskTierOverrides": {
      "classification": "normal"
    }
  }
}
```

### Step 3: Add tier-aware methods to ModelRouter
- `getModelForTask(task: TaskType)`: resolves task → tier → model name → PI-mono Model
- `getModelForTier(tier: ModelTier)`: resolves tier → model name → PI-mono Model
- `getTierConfig()`: returns the current tier-to-model mapping
- `setTierModel(tier: ModelTier, modelName: string)`: update a tier's model

The existing `getModel()` stays unchanged for backward compatibility — it always returns the active model (which is the "normal" tier by default).

### Step 4: Model fallback chain
Add `fallback?: string` to `ModelConfig`. When a tier's model fails (provider error, rate limit), automatically retry with the fallback model.

Implementation:
- Add `getModelWithFallback(name: string)` that catches provider errors and retries
- Detect circular fallback chains (A → B → A) during validation
- Tier resolution calls `getModelWithFallback()` so all tiers get fallback for free

### Step 5: Model aliases
Add `modelAliases?: Record<string, string>` to `RuntimeConfig` — maps shorthand names to model config names. Example: `{ "fast": "haiku", "smart": "sonnet", "think": "opus" }`.

Add `resolveAlias(name: string): string` to `ModelRouter`. Wire into `model.switch` tRPC call and TUI `/model` command.

### Step 6: Expose routing via tRPC
- `model.tiers` query: returns current tier-to-model mapping
- `model.setTier` mutation: update a tier's model
- `model.routing` query: returns full routing state (tiers, aliases, fallbacks, active model)

### Step 7: Wire into runtime and agent
- `EngineRuntime.createAgent()` receives the router (already does), but now subsystems can call `router.getModelForTask("classification")` for internal tasks
- The exec classifier from plan #054 uses `router.getModelForTask("classification")` instead of the main chat model
- The agent chat loop uses `router.getModelForTask("chat")` (= performance tier) for conversation

## Files to change
- `src/engine/router/router.ts` (modify — add tier resolution, fallback, aliases, task-aware methods)
- `src/engine/router/types.ts` (modify — add `fallback` to `ModelConfig`)
- `src/engine/router/task-types.ts` (create — TaskType, ModelTier, DEFAULT_TASK_TIER)
- `src/engine/config/types.ts` (modify — add `modelTiers`, `taskTierOverrides`, `modelAliases` to RuntimeConfig)
- `src/engine/config/defaults.ts` (modify — add defaults)
- `src/engine/runtime.ts` (modify — expose tier-aware routing to subsystems)
- `src/engine/procedures.ts` (modify — add `model.tiers`, `model.setTier`, `model.routing` queries)
- `src/connectors/tui/App.tsx` (modify — resolve aliases in /model command)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass, no regression
- Test: tier resolution — `getModelForTask("classification")` returns eco model when configured
- Test: unconfigured tiers fall back to active model (zero behavior change)
- Test: `getModelForTier("performance")` returns the configured performance model
- Test: fallback chain — mock provider failure, verify retry with fallback model
- Test: circular fallback chain (A → B → A) detected and throws during validation
- Test: aliases — `resolveAlias("fast")` returns "haiku", `resolveAlias("sonnet")` returns "sonnet"
- Test: `model.routing` query returns complete routing state with tiers
- Test: task tier override — set `classification: "normal"` in config, verify it uses normal instead of eco
- Edge cases: tier pointing to non-existent model should throw clear error at startup

## Progress
- Created `task-types.ts` with ModelTier (performance/normal/eco), TaskType, and DEFAULT_TASK_TIER mapping
- Added `modelTiers`, `taskTierOverrides`, `modelAliases` to RuntimeConfig
- Added `fallback?: string` to ModelConfig
- Extended ModelRouter with: getTierModel, getTierConfig, setTierModel, getModelForTask, getModelForTier, getStreamOptionsForTask, resolveAlias, getRoutingState, getModelWithFallback, validateFallbackChains
- Wired runtime config into router constructor
- Added tRPC endpoints: model.tiers, model.setTier, model.routing
- Wired alias resolution into model.switch
- 15 new tests covering tiers, aliases, fallback validation, circular chain detection
- Modified: router.ts, types.ts, task-types.ts (new), config/types.ts, runtime.ts, procedures.ts, router/index.ts, router.test.ts
- Verification: typecheck ✓, lint ✓, 253 tests pass ✓
