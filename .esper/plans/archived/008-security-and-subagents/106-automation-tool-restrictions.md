---
id: 106
title: Cron/webhook tool restrictions + per-task security profiles
status: done
type: feature
priority: 3
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
---
# Cron/webhook tool restrictions + per-task security profiles

## Context

Cron and webhook agents currently have full tool access — the same `ToolRegistry` as interactive sessions. An automated task (cron job checking the weather) can call `exec`, `write`, or any other tool. Exploration 011 recommends restricted tool registries for automated agents, configurable per-task.

Current automation config (`runtime.automation`) defines cron and webhook tasks with prompts, schedules, and slugs, but no tool or security restrictions.

## Approach

### 1. Default tool restrictions

Define safe defaults for automated agents:

```typescript
// Cron: read + search, no writes or exec
const CRON_DEFAULT_TOOLS = ["read", "web_fetch", "web_search", "memory_search", "memory_write", "notify"];

// Webhook: even more restricted — no memory writes
const WEBHOOK_DEFAULT_TOOLS = ["read", "web_fetch", "web_search", "memory_search", "notify"];
```

### 2. Per-task tool and mode config

Extend the task definition in automation config:

```typescript
interface AutomationTask {
  prompt: string;
  schedule?: string;          // cron expression (null for webhook-only)
  slug?: string;              // webhook slug
  mode?: SecurityMode;        // default: "default"
  allowedTools?: string[];    // override default tool list
  modelTier?: string;         // model tier override
}
```

### 3. Filtered ToolRegistry

Add a `filter(allowedNames: string[]): ToolRegistry` method to `ToolRegistry`:

```typescript
filter(allowedNames: string[]): ToolRegistry {
  const filtered = new ToolRegistry();
  for (const name of allowedNames) {
    const tool = this.get(name);
    if (tool) filtered.register(tool);
  }
  return filtered;
}
```

When creating agents for cron/webhook tasks, pass a filtered registry instead of the full one.

### 4. Integration

- `procedures.ts`: When dispatching cron task, create agent with `runtime.tools.filter(task.allowedTools ?? CRON_DEFAULT_TOOLS)`
- `server.ts`: When dispatching webhook task, create agent with `runtime.tools.filter(task.allowedTools ?? WEBHOOK_DEFAULT_TOOLS)`
- If a task specifies `mode`, apply that security mode to the task's session

### 5. Config validation

Validate that `allowedTools` entries match registered tool names. Warn on startup if a task references an unknown tool.

### 6. Tests

- Unit test: filtered ToolRegistry only exposes allowed tools
- Unit test: cron agent cannot call exec with default config
- Unit test: webhook agent cannot call memory_write with default config
- Unit test: per-task allowedTools override works
- Unit test: unknown tool in allowedTools logs warning

## Files to change

- `src/engine/agent/registry.ts` (modify — add `filter()` method)
- `src/engine/procedures.ts` (modify — use filtered registry for cron agents)
- `src/engine/server.ts` (modify — use filtered registry for webhook agents)
- `src/engine/config/types.ts` (modify — add mode/allowedTools to AutomationTask)
- `src/engine/config/defaults.ts` (modify — add default tool lists)
- `src/engine/agent/registry.test.ts` (create — filter tests)

## Verification

- Run: `bun test src/engine/agent/registry.test.ts`
- Expected: Filter tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Edge cases: Task requests a tool that was registered after startup (dynamic skills), empty allowedTools list (no tools available — agent can only respond with text)
