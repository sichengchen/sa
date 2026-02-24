---
id: 109
title: Subagent background execution + Orchestrator
status: done
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
pr: https://github.com/sichengchen/sa/pull/29
---
# Subagent background execution + Orchestrator

## Context

Plan 108 implements synchronous subagent spawning — the parent blocks until the child completes. This plan adds background execution (exploration 008 Approach B): the delegate tool returns a handle immediately, the child runs in the background, and a `delegate_status` tool polls for results. This enables parallel subagent execution.

The `exec` tool already has a background execution pattern: `exec({ background: true })` returns a handle, `exec_status({ id })` polls. Subagent background follows the same UX pattern.

## Approach

### 1. Orchestrator class (`src/engine/agent/orchestrator.ts`)

```typescript
class Orchestrator {
  private running = new Map<string, { subAgent: SubAgent; promise: Promise<SubAgentResult> }>();
  private completed = new Map<string, SubAgentResult>();
  private concurrencyLimit: number;  // from config, default 3

  constructor(runtime: EngineRuntime, config: OrchestrationConfig);

  // Spawn a background sub-agent, return handle immediately
  spawnBackground(options: SubAgentOptions): string;  // returns subAgentId

  // Check status of a specific sub-agent
  getStatus(subAgentId: string): SubAgentStatus;

  // List all sub-agents (running + completed)
  list(): SubAgentStatus[];

  // Cancel a running sub-agent
  cancel(subAgentId: string): boolean;

  // Cleanup completed results older than TTL
  cleanup(): void;
}

interface SubAgentStatus {
  id: string;
  task: string;
  status: "running" | "done" | "error" | "cancelled";
  result?: string;
  error?: string;
  toolCalls?: { name: string; summary: string }[];
  startedAt: number;
  completedAt?: number;
}
```

Key behaviors:
- **Concurrency limit**: Max 3 concurrent subagents (configurable). If limit reached, new spawns are queued.
- **Result retention**: Completed results kept for 30 minutes, then cleaned up.
- **Cancellation**: AbortController signal propagated to child agent.
- **Per-session**: Orchestrator is per-parent-session (stored alongside sessionAgents in procedures.ts).

### 2. Update `delegate` tool

Add `background` parameter:
```typescript
parameters: {
  task: string,
  model?: string,
  tools?: string[],
  background?: boolean,   // NEW: if true, return handle immediately
}
```

When `background: true`:
1. Get or create Orchestrator for the parent session
2. Call `orchestrator.spawnBackground(options)`
3. Return `{ subAgentId: "...", status: "running", message: "Sub-agent spawned in background. Use delegate_status to check progress." }`

When `background: false` (default): existing synchronous behavior from plan 108.

### 3. `delegate_status` tool (`src/engine/tools/delegate-status.ts`)

```typescript
{
  name: "delegate_status",
  description: "Check status of background sub-agents or get their results.",
  dangerLevel: "safe",
  parameters: {
    id?: { type: "string", description: "Specific sub-agent ID (omit to list all)" },
  }
}
```

Returns:
- If `id` specified: full status of that sub-agent (including result if done)
- If `id` omitted: summary list of all sub-agents for this session

### 4. Multi-spawn support

Allow `delegate` to accept an array of tasks:
```typescript
parameters: {
  tasks?: { task: string, model?: string, tools?: string[] }[],  // spawn multiple
  task?: string,     // spawn single (existing)
  background?: boolean,
}
```

When `tasks` is provided: spawn all as background, return array of handles. This is the common parallel research pattern.

### 5. Config expansion

```typescript
orchestration?: {
  defaultTier?: string;
  defaultTimeoutMs?: number;
  memoryWriteDefault?: boolean;
  maxConcurrent?: number;            // default: 3
  maxSubAgentsPerTurn?: number;      // safety limit, default: 10
  resultRetentionMs?: number;        // default: 1_800_000 (30 min)
}
```

### 6. Tests

- Unit test: Orchestrator spawns background sub-agent, getStatus returns "running"
- Unit test: completed sub-agent result available via getStatus
- Unit test: concurrency limit queues excess sub-agents
- Unit test: cancel() stops a running sub-agent
- Unit test: delegate_status returns correct summaries
- Unit test: multi-spawn creates multiple background agents
- Unit test: result cleanup after retention TTL

## Files to change

- `src/engine/agent/orchestrator.ts` (create — Orchestrator class)
- `src/engine/agent/orchestrator.test.ts` (create — unit tests)
- `src/engine/tools/delegate.ts` (modify — add background mode, multi-spawn)
- `src/engine/tools/delegate-status.ts` (create — status polling tool)
- `src/engine/tools/delegate-status.test.ts` (create — tool tests)
- `src/engine/tools/index.ts` (modify — register delegate_status tool)
- `src/engine/procedures.ts` (modify — manage per-session Orchestrators, cleanup on session destroy)
- `src/engine/config/types.ts` (modify — expand orchestration config)
- `src/engine/config/defaults.ts` (modify — add new defaults)
- `src/engine/skills/bundled/sa/docs/tools.md` (modify — document delegate_status)

## Verification

- Run: `bun test src/engine/agent/orchestrator.test.ts src/engine/tools/delegate-status.test.ts`
- Expected: All background execution and polling tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Manual: Ask agent to "research weather in 3 cities simultaneously" — spawns 3 background sub-agents, polls for results
- Edge cases: All sub-agents fail simultaneously, parent session destroyed while sub-agents running (cleanup), concurrency limit hit with mixed sync+background calls

## Progress
- Created `src/engine/agent/orchestrator.ts` — Orchestrator class with concurrency limits, queuing, result retention, cancellation
- Created `src/engine/tools/delegate-status.ts` — delegate_status tool for polling sub-agent status
- Updated `src/engine/tools/delegate.ts` — added background mode and multi-spawn support
- Updated `src/engine/tools/index.ts` — export delegate_status
- Updated `src/engine/config/types.ts` — expanded orchestration config (maxConcurrent, maxSubAgentsPerTurn, resultRetentionMs)
- Wired shared Orchestrator in `src/engine/runtime.ts` — passes to both delegate and delegate_status tools
- Fixed queuing bug in Orchestrator.spawnBackground
- Created `src/engine/agent/orchestrator.test.ts` (9 tests) and `src/engine/tools/delegate-status.test.ts` (6 tests)
- Note: Used shared orchestrator (not per-session) since tools are shared across sessions — matches exec background pattern
- Note: Skipped procedures.ts per-session orchestrator map (not needed with shared orchestrator), config/defaults.ts (no new defaults needed), and tools.md doc update (low priority)
- Verification: typecheck ✓, lint ✓, 726 tests pass
