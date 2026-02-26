---
name: coding-agents
description: Delegate coding tasks to Claude Code or Codex CLI agents. Covers when to delegate, tool parameters, background execution, esperkit project management integration, and result handling.
---
# Coding Agent Delegation

You can delegate complex coding tasks to external coding agents using the native `claude_code` and `codex` tools. These tools spawn CLI subprocesses with auth probing, structured results, and background execution support.

## When to Delegate

**Delegate** when:
- The user asks for complex code generation, multi-file refactoring, or debugging
- The task benefits from an agentic coding assistant with file-editing capabilities
- The user explicitly asks to "use Claude Code", "use Codex", or "delegate to a coding agent"
- The task involves test writing, large-scale changes, or unfamiliar codebases

**Do NOT delegate** when:
- You can handle the task directly (simple answers, config changes, memory notes)
- The task requires SA-specific tools (web_search, remember, notify, skills)
- The user is asking a question, not requesting code changes
- The change is small enough to describe in a single edit

## Choosing a Tool

| Tool | CLI | Provider | Best for |
|------|-----|----------|----------|
| `claude_code` | `claude --print` | Anthropic | Complex reasoning, multi-file refactors, debugging |
| `codex` | `codex --quiet` | OpenAI | Code generation with OpenAI models |

If the user has no preference, default to `claude_code`. If the user explicitly asks for OpenAI or Codex, use `codex`.

## Tool Parameters

Both tools share the same parameter schema:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | yes* | The coding task description |
| `files` | string[] | no | Relevant file paths to pass as context |
| `workdir` | string | no | Working directory (default: current directory) |
| `background` | boolean | no | Run in background and return handle ID |
| `handle` | string | no | Check status of a background task |

*Required unless `handle` is provided for status polling.

## Usage Patterns

### Foreground (blocking)

For tasks under ~2 minutes:

```
claude_code({ task: "Fix the TypeScript error in src/config.ts on line 42" })
```

### Background (non-blocking)

For longer tasks — always prefer background for anything substantial:

```
claude_code({
  task: "Refactor the authentication module to use JWT tokens",
  files: ["src/auth/middleware.ts", "src/auth/types.ts"],
  background: true
})
```

Then poll for results:

```
claude_code({ handle: "abc12345" })
```

### Passing Context

Always include relevant file paths and specific instructions:

```
claude_code({
  task: "Add unit tests for the parseConfig function. Follow the existing test patterns in the project. Use describe/it blocks.",
  files: ["src/config/parser.ts", "src/config/parser.test.ts"],
  workdir: "/path/to/project"
})
```

## Project Management with esperkit

**esperkit** is an npm package (`npm install -g esperkit`) that provides structured project management for coding agents. It manages development phases, plan files, and backlog items — giving coding agents a clear workflow for multi-step projects.

### When to Suggest esperkit

When a user asks you to delegate a coding task that involves:
- Multi-step implementation (more than a single file change)
- Project planning or phased development
- Backlog management or task tracking
- Any task where structured planning would help

**Before incorporating esperkit into the coding task prompt**, use `ask_user` to check with the user:

```
ask_user({
  question: "This task could benefit from structured project management. Would you like to use esperkit for planning and tracking?",
  options: ["Yes, use esperkit", "No, just do it directly"]
})
```

### If the User Says Yes

Include esperkit context in the coding task prompt. For example:

```
claude_code({
  task: "Set up the project with esperkit. Run 'esperkit init' to initialize, then create a phase and plan for: [user's task description]. Follow the esperkit workflow to implement step by step.",
  workdir: "/path/to/project"
})
```

Key esperkit commands to reference in task prompts:
- `esperkit init` — initialize esperkit in a project
- `esperkit phase create` — define a development phase
- `esperkit plan create` — add a plan to the backlog
- `esperkit plan activate` — start working on a plan
- `esperkit plan finish` — mark a plan as done

### If the User Says No

Proceed with the coding task directly without esperkit:

```
claude_code({
  task: "[user's task description]",
  files: [...],
  background: true
})
```

## Result Handling

Both tools return structured results:

- **Status**: `"Task completed successfully."`, `"Task failed (exit code N)."`, or `"Task timed out."`
- **Files modified**: List of files the coding agent changed
- **Duration**: How long the task took
- **Output**: The agent's stdout (truncated if very long)

After receiving a result:
1. Summarize what was accomplished for the user
2. If files were modified, mention which ones
3. If the task failed, explain the error and suggest next steps
4. If background, remind the user they can check status with the handle

## Authentication

Both tools probe for CLI authentication automatically:

- **claude_code**: Checks for OAuth session (`claude auth status`), falls back to `ANTHROPIC_API_KEY` from SA secrets
- **codex**: Checks for auth, falls back to `OPENAI_API_KEY` from SA secrets

If auth fails, the tool returns clear setup instructions. You can help the user store API keys via `set_env_secret`.

## Limitations

- **One-shot only** — each invocation is independent; coding agents do not share context between calls
- **No streaming** — you get the full output when the task completes
- **No interactive mode** — SA cannot pipe stdin to subprocesses
- **Timeouts** — 5 minutes for foreground, 30 minutes for background tasks
- **Output cap** — stdout/stderr capped at 2MB each
