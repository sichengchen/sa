# Coding Agent Tools

The `claude_code` and `codex` tools delegate coding tasks to external CLI
agents (Claude Code and OpenAI Codex). Both use the shared `AgentSubprocess`
infrastructure for lifecycle management, auth probing, structured output
parsing, timeout handling, and background execution.

---

## claude_code Tool

Delegates coding tasks to Claude Code CLI (`claude --print`).

### Parameters

| Parameter  | Type     | Required | Description                                    |
| ---------- | -------- | -------- | ---------------------------------------------- |
| task       | string   | yes\*    | The coding task description                    |
| files      | string[] | no       | Relevant file paths passed as context          |
| workdir    | string   | no       | Working directory (default: current directory) |
| background | boolean  | no       | Run in background and return handle ID         |
| handle     | string   | no       | Check status of a background task by handle ID |

\*Required unless `handle` is provided for status polling.

### Danger Level

**moderate** — spawns a subprocess that can modify files.

### Auth Flow

1. `probeAuth("claude")` checks if CLI is installed (`claude --version`)
2. If installed, runs `claude auth status` to check OAuth/API key auth
3. If not authenticated, injects `ANTHROPIC_API_KEY` from Esperta Aria secrets
4. If no key available, returns error with setup instructions

---

## codex Tool

Delegates coding tasks to OpenAI Codex CLI (`codex --quiet`).

### Parameters

Same schema as `claude_code` (task, files, workdir, background, handle).

### Danger Level

**moderate** — spawns a subprocess that can modify files.

### Auth Flow

1. `probeAuth("codex")` checks if CLI is installed (`codex --version`)
2. If not authenticated, injects `OPENAI_API_KEY` from Esperta Aria secrets
3. If no key available, returns error with setup instructions

---

## AgentSubprocess Infrastructure

Shared process manager lives in `packages/runtime/src/tools/agent-subprocess.ts`.

### Core Functions

| Function                  | Description                                |
| ------------------------- | ------------------------------------------ |
| `probeAuth(cli)`          | Check CLI installation and auth status     |
| `runSubprocess(config)`   | Run foreground subprocess with timeout     |
| `runBackground(config)`   | Start background subprocess, return handle |
| `getBackgroundStatus(id)` | Poll background task status                |

### Subprocess Config

| Field       | Type     | Default                | Description                      |
| ----------- | -------- | ---------------------- | -------------------------------- |
| `cli`       | string   | —                      | CLI binary name                  |
| `args`      | string[] | —                      | Command-line arguments           |
| `env`       | object   | —                      | Additional environment variables |
| `workdir`   | string   | cwd                    | Working directory                |
| `timeoutMs` | number   | 300s (fg) / 1800s (bg) | Execution timeout                |

### Result Structure

| Field           | Type      | Description                         |
| --------------- | --------- | ----------------------------------- |
| `status`        | string    | `"done"`, `"error"`, or `"timeout"` |
| `exitCode`      | number    | Process exit code                   |
| `stdout`        | string    | Standard output (max 2MB)           |
| `stderr`        | string    | Standard error (max 2MB)            |
| `duration`      | number    | Execution time in milliseconds      |
| `summary`       | string?   | Parsed summary from output          |
| `filesModified` | string[]? | Parsed list of modified files       |

### Background Execution

Background handles are stored in memory and can be polled via the tool's
`handle` parameter. Each handle tracks:

- `id` — runtime-generated background handle ID
- `running` — whether the subprocess is still active
- `startedAt` — timestamp for elapsed time calculation
- `result` — populated on completion

### Auth Status

| Field           | Type    | Description                         |
| --------------- | ------- | ----------------------------------- |
| `installed`     | boolean | CLI binary found                    |
| `authenticated` | boolean | Valid auth credentials detected     |
| `version`       | string? | CLI version string                  |
| `authMethod`    | string? | `"oauth"`, `"api_key"`, or `"none"` |
