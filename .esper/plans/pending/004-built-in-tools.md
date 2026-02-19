---
id: 004
title: Built-in tools (Read, Write, Edit, Bash)
status: pending
type: feature
priority: 3
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Built-in tools (Read, Write, Edit, Bash)

## Context
SA must have at minimum four built-in tools: Read (read file contents), Write (write/create files), Edit (string replacement in files), and Bash (execute shell commands). These tools are what make the agent useful as a personal assistant.

## Approach
1. Define a `Tool` interface: `{ name, description, parameters (JSON Schema), execute(params): Promise<ToolResult> }`
2. Implement each tool:
   - **Read**: reads file at given path, returns content (with optional line range)
   - **Write**: writes content to file path, creates directories if needed
   - **Edit**: takes file path, old_string, new_string — performs exact string replacement
   - **Bash**: executes a shell command via `Bun.spawn`, returns stdout/stderr with timeout
3. Each tool validates its parameters before execution
4. Bash tool should have configurable timeout and working directory
5. All tools return a structured `ToolResult` with success/error status and output
6. Write unit tests for each tool (use temp directories for file operations)

## Files to change
- `src/tools/types.ts` (create — Tool interface, ToolResult type)
- `src/tools/read.ts` (create — Read tool)
- `src/tools/write.ts` (create — Write tool)
- `src/tools/edit.ts` (create — Edit tool)
- `src/tools/bash.ts` (create — Bash tool)
- `src/tools/index.ts` (create — barrel export, registers all tools)
- `tests/tools.test.ts` (create — unit tests for all tools)

## Verification
- Run: `bun test tests/tools.test.ts`
- Expected: Read reads files, Write creates/overwrites, Edit replaces strings, Bash executes commands
- Edge cases: file not found (Read), permission denied, Edit with non-unique string, Bash timeout, command not found
