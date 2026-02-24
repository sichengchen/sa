---
id: 110
title: Subagent memory policy + documentation
status: done
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
pr: https://github.com/sichengchen/sa/pull/29
---
# Subagent memory policy + documentation

## Context

All agents share the global `MemoryManager`. Subagents (plans 108-109) can call `memory_write` and `memory_search` through their tool registry. Without a policy, a background sub-agent researching a topic could write to memory, permanently affecting all future sessions. This was flagged as a carry-forward concern from Phase 7.

Additionally, the `sa` bundled skill and docs need updating to cover the full security model v2 and subagent capabilities.

## Approach

### 1. Memory write policy for subagents

Add `memoryWrite` option to `SubAgentOptions` (plan 108 defines the field):
- **Synchronous subagents**: `memoryWrite: true` by default (parent is blocking, user is aware)
- **Background subagents**: `memoryWrite: false` by default (runs without supervision)
- Configurable via `orchestration.memoryWriteDefault` and per-spawn override

When `memoryWrite: false`:
- Remove `memory_write` and `memory_delete` from the sub-agent's filtered tool registry
- Keep `memory_search` and `memory_read` (read-only access is safe)

### 2. Memory write attribution

When a subagent writes to memory, tag the entry with source metadata:
- Add `source?: string` field to memory write operations
- Subagent writes tagged as `source: "subagent:<id>"`
- This allows future auditing of which agent wrote what

In `MemoryManager.write()`, accept optional `source` parameter. Store in the SQLite index as a metadata column.

### 3. Memory context for subagents

Subagents should receive relevant memory context for their task, not the full parent context:
- When spawning a subagent, run a `memory_search(task)` to find relevant memories
- Include top results in the subagent's system prompt as initial context
- This gives subagents useful context without loading the full memory

### 4. Update bundled SA skill docs

Update `src/engine/skills/bundled/sa/` documentation:

**`docs/tools.md`** — Add:
- `delegate` tool: usage, parameters, sync vs background, tool allowlists
- `delegate_status` tool: polling, result retrieval
- Security tools context: URL policy blocks, exec fence blocks, inline escalation

**`docs/security.md`** (create) — Document:
- 6-layer security architecture overview
- Security modes (default/trusted/unrestricted)
- Audit log usage (`sa audit`)
- Content framing (what it is, why data tags exist)
- Exec fence configuration
- URL policy configuration

**`SKILL.md`** — Update the agent quick-reference:
- Add delegate/delegate_status to tool list
- Add security mode awareness
- Update safety directives to reference content framing

### 5. Regenerate embedded skills

Run the skill embedding step to update `embedded-skills.generated.ts` with new docs.

### 6. Tests

- Unit test: background subagent with memoryWrite=false cannot call memory_write
- Unit test: synchronous subagent with memoryWrite=true can call memory_write
- Unit test: memory write attribution tags entries with subagent source
- Unit test: subagent receives relevant memory context in system prompt

## Files to change

- `src/engine/agent/sub-agent.ts` (modify — enforce memoryWrite policy on tool registry)
- `src/engine/memory/manager.ts` (modify — add source parameter to write, store in index)
- `src/engine/memory/types.ts` (modify — add source field to MemoryEntry)
- `src/engine/agent/sub-agent.test.ts` (modify — add memory policy tests)
- `src/engine/skills/bundled/sa/docs/tools.md` (modify — document delegate tools)
- `src/engine/skills/bundled/sa/docs/security.md` (create — security architecture docs)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — update quick-reference)

## Verification

- Run: `bun test src/engine/agent/sub-agent.test.ts`
- Expected: Memory policy tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Manual: Spawn background sub-agent, verify it cannot write to memory; spawn sync sub-agent, verify it can
- Edge cases: Sub-agent tries memory_write when disabled (gets informative error, not crash), memory search for subagent context returns empty (subagent still works, just without context)
