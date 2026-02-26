---
name: coding-agents
description: Delegate coding tasks to Claude Code or Codex CLI agents. Use when: tasks involve complex code generation, multi-file refactoring, debugging, or benefits from an agentic coding assistant, or user explicitly asks for Claude Code or Codex. NOT for: simple answers, config changes, or simple tasks that can be handled directly.
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
- The task requires SA-specific tools (remember, notify, SA-related skills)
- The user is asking a question, not requesting code changes
- The change is small enough to describe in a single edit

## Choosing a Tool

| Tool | CLI | Provider | Best for |
|------|-----|----------|----------|
| `claude_code` | `claude --print` | Anthropic | Rapid development and debugging, systematic implementation, tasks with well-defined requirements |
| `codex` | `codex --quiet` | OpenAI | Tasks with vague instructions or unclear requirements |

If the user has explicit preference, follow it.

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

**esperkit** is an npm package that installs `/esper:*` slash commands into Claude Code as skills. These slash commands give coding agents structured project management — phases, plans, backlog, automated implementation, and verification.

**Important**: SA does NOT run `esperkit` CLI commands directly (except for installing it). SA's role is to:
1. Install esperkit into the target project if needed
2. Send the user's task to the coding agent with instructions to use `/esper:*` slash commands

### When to Suggest esperkit

When a user asks you to delegate a coding task that involves:
- Multi-step implementation (more than a single file change)
- Project planning or phased development
- Backlog management or task tracking
- Any task where structured planning would help

**Before incorporating esperkit**, use `ask_user` to check with the user:

```
ask_user({
  question: "This task could benefit from structured project management. Would you like to use esperkit for planning and tracking?",
  options: ["Yes, use esperkit", "No, just do it directly"]
})
```

### If the User Says Yes

**Step 1: Install esperkit** (if not already installed in the project).

Run this via `exec` to install the slash commands into the coding agent:

```
exec({ command: "cd /path/to/project && npx esperkit", danger: "moderate" })
```

This installs `/esper:*` skills into Claude Code's `~/.claude/skills/` directory so the coding agent can use them.

**Step 2: Delegate the task** with instructions to use `/esper:*` slash commands.

The coding agent receives slash commands as part of its task prompt. Key commands:

| Slash command | Purpose |
|---------------|---------|
| `/esper:init <description>` | Initialize esperkit and define the project scope |
| `/esper:phase <description>` | Define a new development phase with plans |
| `/esper:plan <description>` | Add a feature plan to the phase backlog |
| `/esper:fix <description>` | Add a bug fix plan to the backlog |
| `/esper:backlog` | View pending and active plans |
| `/esper:apply` | Start implementing the next pending plan |
| `/esper:yolo` | Auto-implement all pending plans sequentially |
| `/esper:continue` | Resume an interrupted implementation |
| `/esper:finish` | Verify, archive, and complete the active plan |
| `/esper:ship` | Push and open a PR |
| `/esper:review` | Code review on branch diffs |
| `/esper:audit` | Project health and quality audit |

Example — new project:

```
claude_code({
  task: "/esper:init [user's task description]",
  workdir: "/path/to/project"
})
```

Example — project already has esperkit, implement everything:

```
claude_code({
  task: "/esper:yolo",
  workdir: "/path/to/project"
})
```

Example — add a plan and start building:

```
claude_code({
  task: "/esper:plan [user's feature description]",
  workdir: "/path/to/project"
})
```

Then follow up with:

```
claude_code({
  task: "/esper:apply",
  workdir: "/path/to/project"
})
```

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
