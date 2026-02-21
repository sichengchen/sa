---
id: 41
title: fix: model router changes not persisted to config.json
status: done
type: fix
priority: 1
phase: phase-2
branch: fix/model-router-persistence
created: 2026-02-20
shipped_at: 2026-02-21
---
# fix: model router changes not persisted to config.json

## Context

Two related bugs cause all model router mutations to be lost on engine restart:

### Bug 1: `switchModel()` doesn't persist
`ModelRouter.switchModel()` (router.ts:166-172) sets `this.activeModelName` in memory but never calls `this.save()`. On restart, the engine reloads `defaultModel` from config.json, reverting the switch.

### Bug 2: `save()` writes stale config
The `onSave` callback is `() => config.saveConfig()` (runtime.ts:80), which writes `ConfigManager.configFile` — the snapshot from when the config was first loaded. The router mutates its own `this.models`, `this.providers`, `this.activeModelName`, but those changes are never synced back into the ConfigManager's cached `configFile` before writing. So `addModel()`, `removeModel()`, `addProvider()`, and `removeProvider()` all call `save()` but the written file doesn't include their changes.

## Approach

1. **Change the `onSave` callback** to accept the router's current state and sync it into the ConfigManager before writing. Change the signature from `() => Promise<void>` to `(state: { providers, models, defaultModel, activeModel }) => Promise<void>`.

2. **In `runtime.ts`**, update the callback to merge the router state into the config before saving:
   ```typescript
   async (state) => {
     await config.saveConfig({
       ...currentConfig,
       providers: state.providers,
       models: state.models,
       defaultModel: state.defaultModel,
       runtime: { ...currentConfig.runtime, activeModel: state.activeModel },
     });
   }
   ```

3. **In `router.ts`**, update `save()` to pass current state to the callback. Update `switchModel()` to call `save()`.

4. **Update `router.ts` `save()` method** to pass current state:
   ```typescript
   private async save(): Promise<void> {
     if (this.onSave) {
       await this.onSave({
         providers: this.providers,
         models: this.models,
         defaultModel: this.defaultModelName,
         activeModel: this.activeModelName,
       });
     }
   }
   ```

5. **Make `switchModel()` async** and add `await this.save()` call.

## Files to change

- `src/engine/router/router.ts` (modify — make switchModel async + call save, update save() to pass state, update onSave type)
- `src/engine/runtime.ts` (modify — update onSave callback to sync router state into ConfigManager)
- `src/engine/procedures.ts` (modify — await switchModel if it becomes async)

## Verification

- Run: `bun run typecheck && bun run lint && bun test`
- Manual test: switch model via Telegram `/model`, restart engine, verify active model persisted
- Manual test: the model list should show all configured models after restart
- Regression check: addModel/removeModel/addProvider/removeProvider should also persist correctly

## Progress
- Milestones: 4 commits
- Modified: src/engine/router/router.ts, src/engine/router/index.ts, src/engine/runtime.ts, src/engine/procedures.ts, tests/router.test.ts, tests/integration/config-router.test.ts
- Verification: bun run typecheck passes; bun run lint passes; 201 tests pass
