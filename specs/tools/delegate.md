# Delegate Tools

Two tools for sub-agent orchestration. The main agent can spawn child agents
to work on tasks concurrently or sequentially.

---

## delegate

Spawn a sub-agent to perform a task.

### Parameters

| Parameter  | Type     | Required | Default | Description                          |
|------------|----------|----------|---------|--------------------------------------|
| task       | string   | no*      | —       | Single task description              |
| tasks      | string[] | no*      | —       | Multiple tasks (always background)   |
| model      | string   | no       | —       | Model override for sub-agent         |
| tools      | string[] | no       | —       | Allowed tools (whitelist)            |
| background | boolean  | no       | false   | Run without blocking                 |

*One of `task` or `tasks` is required.

### Sync Mode

When `background` is false (default), the delegate call blocks until the
sub-agent completes.

Returns:
- **output** — sub-agent's final text response
- **toolCalls** — list of tools the sub-agent invoked
- **status** — "completed" or "error"

### Background Mode

When `background` is true, returns immediately with a **handle**. Poll with
`delegate_status`.

### Multi-Spawn

When `tasks` array is provided, each task spawns a separate sub-agent. All
run in background (regardless of `background` flag). Returns an array of
handles.

### Concurrency Limits

| Limit                | Value |
|----------------------|-------|
| Max concurrent       | 3     |
| Max per turn         | 10    |

Exceeding concurrent limit queues the task. Exceeding per-turn limit returns
an error.

### Tool Whitelist

The `tools` parameter restricts which tools the sub-agent can use. If omitted,
the sub-agent inherits the parent's tool set with security restrictions applied
(see below).

### Model Override

The `model` parameter allows routing the sub-agent to a different model than
the parent. Useful for delegating simple tasks to faster/cheaper models.

---

## delegate_status

Check status of a background sub-agent.

### Parameters

| Parameter | Type   | Required | Default | Description                           |
|-----------|--------|----------|---------|---------------------------------------|
| id        | string | no       | —       | Handle from delegate. Omit to list all. |

### Returns

| Field     | Type   | Description                        |
|-----------|--------|------------------------------------|
| status    | string | "running", "completed", or "error" |
| result    | string | Sub-agent's output (if completed)  |
| error     | string | Error message (if errored)         |
| toolCalls | array  | Tools invoked by sub-agent         |
| elapsed   | number | Runtime in milliseconds            |

When `id` is omitted, returns status for all sub-agents spawned in the
current session.

---

## Security Restrictions

Sub-agents operate under tighter constraints than the parent agent.

Key restrictions:
- Cannot spawn further sub-agents (no nested delegation)
- Cannot use `set_env_secret` or `set_env_variable`
- `exec` commands inherit the parent's working directory fence
- Memory writes follow the configured memory policy

Full sub-agent security model: `specs/subagents.md`.

---

## Config

```json
{
  "orchestration": {
    "maxConcurrent": 3,
    "memoryWriteDefault": "blocked"
  }
}
```

| Key                | Default   | Description                              |
|--------------------|-----------|------------------------------------------|
| maxConcurrent      | 3         | Max simultaneously running sub-agents    |
| memoryWriteDefault | "blocked" | Sub-agent memory_write policy: "blocked", "allowed", or "parent-only" |
