---
id: 006
title: Long-term memory system
status: pending
type: feature
priority: 4
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Long-term memory system

## Context
SA needs persistent memory that survives across sessions. Memories should be stored as simple files (Markdown or JSON) in the SA home directory, following the "configuration as documents" principle. No database required.

## Approach
1. Define memory structure:
   - `~/.sa/memory/` — directory containing memory files
   - `~/.sa/memory/MEMORY.md` — main memory file (always loaded into context)
   - `~/.sa/memory/topics/` — optional topic-specific files linked from MEMORY.md
2. Implement `MemoryManager` class:
   - `load()` — reads MEMORY.md and returns content for system prompt injection
   - `save(key, content)` — writes/updates a memory entry
   - `search(query)` — simple keyword search across memory files
   - `list()` — returns all memory entries
   - `delete(key)` — removes a memory entry
3. Memory is injected into the agent's system prompt on each conversation start
4. The agent can use a `remember` tool to save new memories (wraps MemoryManager.save)
5. Memory files are plain Markdown — user can edit them by hand
6. Write unit tests for CRUD operations and search

## Files to change
- `src/memory/types.ts` (create — memory types)
- `src/memory/manager.ts` (create — MemoryManager implementation)
- `src/memory/index.ts` (create — barrel export)
- `src/tools/remember.ts` (create — remember tool for agent use)
- `tests/memory.test.ts` (create — unit tests)

## Verification
- Run: `bun test tests/memory.test.ts`
- Expected: memories persist to disk, search returns relevant entries, MEMORY.md is loaded into context
- Edge cases: empty memory directory, very large MEMORY.md (truncation), concurrent writes
