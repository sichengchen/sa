---
id: 125
title: Native codex tool — replace skill with ToolImpl
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# Native codex tool — replace skill with ToolImpl

## Context

The `codex` bundled skill has the same brittleness as `claude-code` — one-shot exec, unstructured output, auth fragility. This plan creates a native `codex` ToolImpl using the shared `AgentSubprocess` from plan 123, mirroring the `claude_code` tool structure from plan 124.

## Approach

1. Create `src/engine/tools/codex.ts` — `createCodexTool()`:
   - **Parameters** (TypeBox schema):
     - `task: string` — the coding task description
     - `files?: string[]` — relevant file paths
     - `workdir?: string` — working directory
     - `background?: boolean` — background mode
   - **Execution flow**:
     1. Probe auth via `AgentSubprocess.probeAuth("codex")`
     2. If not authenticated: check `secrets.enc` for `OPENAI_API_KEY`, pass as env
     3. Build CLI args: `codex --quiet "<task>"` (or appropriate flags)
     4. Spawn via `AgentSubprocess`
     5. Parse result: extract summary, files modified
     6. Return structured `ToolResult`
   - **Danger level**: `"moderate"`
   - **Summary**: "Delegate coding tasks to OpenAI Codex CLI"

2. Register in `src/engine/tools/index.ts` and `src/engine/runtime.ts`

3. Deprecate old skill:
   - Add deprecation notice to `src/engine/skills/bundled/codex/SKILL.md`

4. Update `specs/tools.md` with codex tool documentation

## Files to change

- `src/engine/tools/codex.ts` (create — codex ToolImpl)
- `src/engine/tools/index.ts` (modify — export and register)
- `src/engine/runtime.ts` (modify — instantiate with deps)
- `src/engine/skills/bundled/codex/SKILL.md` (modify — add deprecation notice)
- `specs/tools.md` (modify — document codex tool)

## Progress
- Created `src/engine/tools/codex.ts` — native ToolImpl with auth probing, foreground/background execution, handle polling
- Registered in tools/index.ts and runtime.ts (with secrets lookup for API key fallback)
- Deprecated bundled codex skill with notice pointing to native tool
- Modified: codex.ts, index.ts, runtime.ts, SKILL.md
- Verification: typecheck, lint, 740 tests pass

## Verification

- Run: `bun run typecheck`
- Expected: Tool compiles and registers correctly
- Manual: Ask SA to "use codex to add a test for X", verify native tool invocation with structured result
- Edge cases: Codex not installed, no API key, task timeout, large output
