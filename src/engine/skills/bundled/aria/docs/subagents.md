# Sub-Agents

## Overview

The `delegate` tool spawns sub-agents for parallel or background task execution. Sub-agents are lightweight child agents that run with restricted capabilities -- no recursive delegation, auto-approved tool calls, configurable memory access, and isolated wrapped tool environments. Each parent session owns its own orchestration queue, so `delegate_status` only sees child work from the current parent session.

---

## delegate Tool

Spawn a sub-agent to execute a task. Defaults to synchronous (blocking) mode.

### Parameters

| Parameter    | Type     | Required | Description                                                    |
|-------------|----------|----------|----------------------------------------------------------------|
| `task`      | string   | No*      | Task instruction for a single sub-agent                        |
| `tasks`     | array    | No*      | Spawn multiple sub-agents (always background); see multi-spawn |
| `model`     | string   | No       | Model override (default: eco tier)                             |
| `tools`     | string[] | No       | Tool name allowlist (default: all non-delegate tools)          |
| `background`| boolean  | No       | If true, return handle immediately (default: false)            |

*One of `task` or `tasks` is required.

---

## Execution Modes

### Synchronous Mode (default)

Blocks until the sub-agent completes. Returns a structured result containing:

- **output**: The sub-agent's text response
- **toolCalls**: List of tools invoked with summaries
- **status**: `"done"` or `"error"`
- **error**: Error message (if status is `"error"`)

### Background Mode

Set `background: true` to return a sub-agent ID immediately. Poll with `delegate_status` to check progress and retrieve results.

**Concurrency limits:**
- **3 concurrent** background sub-agents (configurable via `orchestration.maxConcurrent`)
- **10 per agent turn** (configurable via `orchestration.maxSubAgentsPerTurn`)

Excess spawns are queued and started as running sub-agents complete. Results are retained for **30 minutes** before automatic cleanup.

---

## delegate_status Tool

Check status of background sub-agents or retrieve their results.

### Parameters

| Parameter | Type   | Required | Description                               |
|-----------|--------|----------|-------------------------------------------|
| `id`      | string | No       | Specific sub-agent ID (omit to list all)  |

### Return Values

- **With `id`**: Full status JSON including result (if done), error, tool calls, and elapsed time.
- **Without `id`**: Summary list of all background sub-agents with status and elapsed time.

---

## Multi-Spawn

The `tasks` parameter spawns multiple background sub-agents in one call. Each entry is:

```json
{ "task": "string", "model?": "string", "tools?": ["string"] }
```

Multi-spawn always runs in background mode. The response includes all spawned sub-agent IDs for polling with `delegate_status`.

---

## Memory Policy

| Mode        | memory_search | memory_read | memory_write | memory_delete |
|-------------|--------------|-------------|-------------|---------------|
| Synchronous | Yes          | Yes         | Yes (default)| Yes (default) |
| Background  | Yes          | Yes         | No (default) | No (default)  |

Background sub-agents cannot write or delete memory by default to prevent unsupervised memory mutation. This is configurable via `orchestration.memoryWriteDefault` in `config.json`.

When memory write is disabled, the `memory_write` and `memory_delete` tools are removed from the sub-agent's tool registry entirely.

---

## Isolation Model

Each sub-agent now gets:

- A fresh wrapped tool environment rather than the parent's shared tool instances
- Its own context-file hint tracker and checkpoint turn state
- The same workspace root as the parent session injected into the sub-agent system prompt
- A session-local background queue and result registry

This keeps delegation state scoped to the parent session while preserving the parent's tool policy and working-directory fence.

---

## Security Restrictions

Sub-agents run with a hardened configuration compared to the parent agent:

| Restriction                    | Rationale                                    |
|--------------------------------|----------------------------------------------|
| No `delegate` tool             | Prevents recursive sub-agent spawning        |
| No `delegate_status` tool      | Sub-agents do not manage other sub-agents    |
| No `claude_code` tool          | Sub-agents do not delegate to coding agents  |
| No `codex` tool                | Sub-agents do not delegate to coding agents  |
| No `ask_user` tool             | Sub-agents cannot ask the user questions     |
| Auto-approve all tool calls    | Sub-agents run without user interaction      |
| Memory write disabled (background) | Prevents unsupervised memory mutation    |
| Eco tier model (default)       | Cost optimization for delegated tasks        |
| Timeout 120s (default)         | Prevents runaway sub-agents                  |

### System Prompt

Sub-agents receive a focused system prompt:

> You are a focused sub-agent executing a specific delegated task.
> Workspace path: `<parent working dir>`
> You have an isolated tool environment and should only return the concrete result, notable findings, and touched files.

### Tool Filtering

1. `delegate`, `delegate_status`, `claude_code`, `codex`, and `ask_user` are always excluded.
2. If `memoryWrite` is false, `memory_write` and `memory_delete` are excluded.
3. If a `tools` allowlist is provided, only those tools (minus the above exclusions) are available.

---

## Configuration

Orchestration settings live in `config.json` under `runtime.orchestration`:

| Field                  | Type   | Default    | Description                                |
|------------------------|--------|------------|--------------------------------------------|
| `maxConcurrent`        | number | `3`        | Max concurrent background sub-agents       |
| `maxSubAgentsPerTurn`  | number | `10`       | Max sub-agents spawned per agent turn       |
| `resultRetentionMs`    | number | `1800000`  | How long completed results are kept (30 min)|
| `defaultTimeoutMs`     | number | `120000`   | Per-sub-agent timeout (2 min)              |
| `memoryWriteDefault`   | boolean| `false`    | Whether background sub-agents can write memory |

---

## ID Format

Sub-agent IDs follow the pattern `subagent:<uuid>`. These IDs are used with `delegate_status` to query individual sub-agent results.
