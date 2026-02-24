---
id: 108
title: "Subagent core — synchronous spawning + delegate tool"
status: pending
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
---

# Subagent core — synchronous spawning + delegate tool

## Context

SA's agent system runs a single Agent per session. The `Agent` class (`src/engine/agent/agent.ts`) is lightweight: owns its own `messages[]`, `ToolRegistry`, and config. `AgentOptions` already supports `modelOverride`, custom `systemPrompt`, custom `tools[]`, and `onToolApproval`. `agent.chat(userText)` is an `AsyncGenerator<AgentEvent>`.

Exploration 008 recommends Approach A (tool-based synchronous spawning) as the first step. This plan implements the core `SubAgent` class and a `delegate` tool that spawns a child agent, runs it to completion, and returns the result as a tool result.

Existing patterns: cron agents already work this way — `runtime.createAgent()` with full tool access, run to completion, fire-and-forget. Subagents extend this with parent/child relationship, narrowed tools, and structured result handling.

## Approach

### 1. SubAgent class (`src/engine/agent/sub-agent.ts`)

```typescript
interface SubAgentOptions {
  id: string;                          // "subagent:<parentSessionId>:<uuid>"
  task: string;                        // prompt for the sub-agent
  modelOverride?: string;              // specific model (default: eco tier)
  tools?: string[];                    // tool name allowlist (default: safe + moderate, exclude delegate)
  timeoutMs?: number;                  // per-subagent timeout (default: 120s)
  memoryWrite?: boolean;               // can write to memory? (default: true for sync, false for background)
}

class SubAgent {
  readonly id: string;
  readonly agent: Agent;
  status: "pending" | "running" | "done" | "error";
  result?: string;
  error?: string;
  toolCalls: { name: string; summary: string }[];

  constructor(runtime: EngineRuntime, options: SubAgentOptions);
  async run(): Promise<SubAgentResult>;
}
```

Key behaviors:
- **Model**: Default to eco tier via `runtime.router.getModelForTier("eco")`
- **Tools**: Filtered registry — exclude `delegate` to prevent recursion (no sub-subagents in v1)
- **Auto-approve**: `onToolApproval: async () => true` — child tool calls don't prompt user
- **Timeout**: AbortController with configurable timeout
- **Session**: Register in SessionManager with prefix `subagent:<parentId>`
- **System prompt**: Focused subtask prompt — no full SA identity, just task instructions

### 2. `delegate` tool (`src/engine/tools/delegate.ts`)

```typescript
{
  name: "delegate",
  description: "Delegate a task to a sub-agent. Returns the sub-agent's complete response.",
  dangerLevel: "moderate",
  parameters: {
    task: { type: "string", description: "The task instruction for the sub-agent" },
    model?: { type: "string", description: "Model override (default: eco tier)" },
    tools?: { type: "array", items: { type: "string" }, description: "Tool allowlist" },
  }
}
```

Execute flow:
1. Create `SubAgent` with the task, model, and tool options
2. Run to completion — collect all `text_delta` events into a result string
3. Collect tool call summaries (tool name + truncated args)
4. Return structured result: `{ output: string, toolCalls: [...], status: "done"|"error" }`
5. Clean up: destroy sub-agent session

### 3. Agent integration

- Pass `EngineRuntime` reference to delegate tool via closure (same pattern as other tools)
- Yield `sub_agent_start` and `sub_agent_end` events from the parent agent loop so connectors can show progress

### 4. EngineEvent types

Add to `src/shared/types.ts`:
```typescript
{ type: "sub_agent_start"; subAgentId: string; task: string }
{ type: "sub_agent_end"; subAgentId: string; status: string; summary: string }
```

### 5. System prompt guidance

Add orchestration guidance to system prompt:
- Use `delegate` for parallel-friendly subtasks (research, data gathering, file analysis)
- Don't delegate simple tasks that you can do directly
- Sub-agents have limited tools (no delegate — no recursion)
- Sub-agent output is a complete response, not a conversation

### 6. Config

```typescript
orchestration?: {
  defaultTier?: string;           // default: "eco"
  defaultTimeoutMs?: number;      // default: 120_000
  memoryWriteDefault?: boolean;   // default: true
}
```

### 7. Tests

- Unit test: SubAgent runs task to completion, returns result
- Unit test: SubAgent times out, returns error
- Unit test: SubAgent uses filtered tool registry (no delegate tool)
- Unit test: delegate tool creates SubAgent and returns structured result
- Unit test: SubAgent session created with correct prefix and cleaned up after
- Unit test: SubAgent auto-approves tool calls

## Files to change

- `src/engine/agent/sub-agent.ts` (create — SubAgent class)
- `src/engine/agent/sub-agent.test.ts` (create — unit tests)
- `src/engine/tools/delegate.ts` (create — delegate tool)
- `src/engine/tools/delegate.test.ts` (create — tool tests)
- `src/engine/tools/index.ts` (modify — register delegate tool)
- `src/engine/agent/registry.ts` (modify — add filter() if not already added in plan 106)
- `src/shared/types.ts` (modify — add sub_agent_start/end events)
- `src/engine/config/types.ts` (modify — add orchestration config)
- `src/engine/config/defaults.ts` (modify — add orchestration defaults)
- `src/engine/runtime.ts` (modify — add orchestration guidance to system prompt)
- `src/engine/skills/bundled/sa/docs/tools.md` (modify — document delegate tool)

## Verification

- Run: `bun test src/engine/agent/sub-agent.test.ts src/engine/tools/delegate.test.ts`
- Expected: All subagent lifecycle and delegate tool tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Manual: Ask agent to "delegate researching the weather in Tokyo to a sub-agent" — sub-agent runs, result returned inline
- Edge cases: SubAgent calls a tool that errors, SubAgent generates no text output, parent agent times out while SubAgent is running
