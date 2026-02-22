---
name: claude-code
description: Delegate coding tasks to Claude Code CLI. Use when: the user wants to generate code, edit files, debug, or refactor using Claude Code as a sub-agent. NOT for: general chat, non-coding tasks, or when the user wants YOU to do the coding directly.
---
# Claude Code Orchestration

You can delegate coding tasks to **Claude Code** (`claude` CLI) using the `exec` tool. Claude Code is an agentic coding assistant with deep code understanding, file editing, and terminal access.

## When to delegate

Delegate to Claude Code when:
- The user asks for complex code generation, refactoring, or debugging
- The task benefits from Claude Code's agentic file-editing capabilities (multi-file changes, test writing, etc.)
- The user explicitly asks to "use Claude Code" or "delegate to Claude"

Do NOT delegate when:
- You can handle the task directly (simple answers, config changes, memory notes)
- The task requires SA-specific tools (web_search, remember, notify, skills)
- The user is asking a question, not requesting code changes

## How to invoke

### One-shot mode (recommended)

Use `--print` for non-interactive one-shot execution:

```
exec({
  command: "claude --print 'Your detailed task description here'",
  background: true,
  env: { "ANTHROPIC_API_KEY": "<key>" }
})
```

- **Always use `background: true`** for tasks that may take more than a few seconds
- Use `exec_status` to poll for completion on background tasks
- `--print` outputs plain text (no interactive UI)

### Passing context

Include relevant context in the prompt:
- File paths to read or modify
- Error messages to debug
- Constraints (language, framework, style)
- Working directory context

Example:
```
exec({
  command: "claude --print 'Fix the TypeScript error in src/engine/agent.ts. The error is: Type string is not assignable to type number on line 42. Read the file first, understand the context, then fix it.'",
  background: true,
  danger: "moderate",
  env: { "ANTHROPIC_API_KEY": "<key>" }
})
```

## API key handling

**Important**: The `exec` tool sanitizes environment variables — `ANTHROPIC_API_KEY` is stripped from the subprocess environment by default. You MUST pass it explicitly via the `env` parameter.

To get the key:
1. Check if the user has configured an Anthropic provider — the key is in `secrets.enc`
2. If you don't have the key value, ask the user to provide it or use `set_env_secret` to store it

```
exec({
  command: "claude --print '...'",
  env: { "ANTHROPIC_API_KEY": "sk-ant-..." },
  background: true
})
```

## Output handling

- `--print` mode outputs plain text to stdout
- For background tasks, use `exec_status({ handle: "<handle>" })` to check progress
- Claude Code may produce long output — the exec tool caps output at 1MB
- Parse the output text and summarize the result for the user

## Limitations

- **No interactive mode** — SA cannot pipe stdin to subprocesses, so `claude` (without `--print`) will not work
- **One-shot only** — each invocation is independent; Claude Code does not share context between calls
- **No streaming** — you get the full output when the command completes, not incremental updates
- **Not installed by default** — if `claude` is not found, inform the user: "Claude Code CLI is not installed. Install it with `npm install -g @anthropic-ai/claude-code`"

## Danger classification

- Set `danger: "moderate"` for code generation and file editing tasks
- Set `danger: "dangerous"` if the task involves running tests, installing packages, or executing generated code
- Set `danger: "safe"` only for read-only operations like code analysis
