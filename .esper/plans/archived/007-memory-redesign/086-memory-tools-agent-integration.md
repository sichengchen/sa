---
id: 86
title: New memory tools + agent integration + docs
status: done
type: feature
priority: 2
phase: 007-memory-redesign
branch: feature/007-memory-redesign
created: 2026-02-22
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/20
---
# New memory tools + agent integration + docs

## Context

Plans 084-085 deliver the core MemoryManager rewrite with SQLite FTS5, hybrid search, and optional vector embeddings. This plan replaces the 5 existing memory tools with 3 clean ones, adds system prompt instructions for memory usage, and integrates dynamic memory injection so the agent receives relevant memory context per chat turn (not just at boot).

Current tools: `remember`, `recall`, `search_memories`, `list_memories`, `forget` — simple wrappers around MemoryManager with no intelligence.

Current integration: MEMORY.md loaded once into system prompt at engine startup. Never refreshed. No instructions telling the agent when/how to use memory.

## Approach

### 1. New tool surface (3 tools replacing 5)

**`memory_write`** (replaces `remember`):
```typescript
name: "memory_write"
parameters: {
  content: string,            // What to write
  key?: string,               // Topic key (for topics/) — omit for journal
  type?: "topic" | "journal", // Default: "topic" if key provided, "journal" if not
}
```
- With `key`: writes/updates `topics/<key>.md` and re-indexes
- Without `key` (or `type: "journal"`): appends to today's `journal/YYYY-MM-DD.md`
- Replaces `remember` with added journal support

**`memory_search`** (replaces `search_memories` + partially `recall`):
```typescript
name: "memory_search"
parameters: {
  query: string,              // Search query
  source?: "all" | "topics" | "journal" | "memory", // Default: "all"
  limit?: number,             // Default: 5
}
```
- Returns ranked snippets with source paths, line ranges, and scores
- Uses hybrid search (BM25 + vector when available)
- Formatted output includes source attribution: `[topics/user-address.md:1-3] (score: 0.85)`

**`memory_read`** (replaces `recall`):
```typescript
name: "memory_read"
parameters: {
  key: string,  // Topic key or file path (e.g. "user-address" or "journal/2026-02-22")
}
```
- Reads full content of a specific memory file
- Supports both topic keys and journal dates
- For when the agent knows exactly what it wants (from search results or prior knowledge)

**`memory_delete`** (replaces `forget`):
```typescript
name: "memory_delete"
parameters: {
  key: string,  // Topic key to delete
}
```
- Deletes topic file + removes from index
- Only works on topics, not journal or MEMORY.md

### 2. System prompt memory instructions

Add a `MEMORY_GUIDE` constant to `runtime.ts`:

```
## Memory
You have persistent memory across sessions. Use it proactively:

**Reading memory:**
- At the start of each conversation, use memory_search to find context relevant to the user's first message.
- When a topic comes up that might have stored context, search before answering.
- Use memory_read when you know the exact key from a previous search.

**Writing memory:**
- When the user shares facts, preferences, or decisions — write them to a topic: memory_write with a descriptive key.
- When the user says "remember this" — always write immediately.
- After substantive exchanges, write a brief journal entry: memory_write without a key.
- Journal entries should be concise (1-3 sentences) capturing what was discussed and any decisions made.

**What goes where:**
- Topics (key provided): Stable facts — addresses, preferences, project context, people, schedules.
- Journal (no key): Session notes — what was discussed, decisions made, tasks completed.
- MEMORY.md: You cannot write to this directly. It is curated by the user.

**Current memory context:**
{memoryContext}
```

### 3. Dynamic memory injection

Instead of loading MEMORY.md once at boot, inject relevant memory per chat turn:

**In `runtime.ts`:**
- Keep MEMORY.md in system prompt (curated context, loaded at boot — this is fine)
- Add a `getMemoryContext(query: string)` method to MemoryManager that:
  1. Searches for `query` across all memory
  2. Returns top 5 snippets formatted as context
  3. Includes today's journal if it exists

**In `agent.ts` or `runtime.ts` (createAgent):**
- Before each `chat()` call, the caller (procedures.ts) can call `memory.getMemoryContext(userMessage)` and prepend the result to the user message as a `[Memory context]` block. This keeps the agent module clean.

Alternatively, inject via a system prompt addendum per turn. The simpler approach is to let procedures.ts augment the user message:

```typescript
// In procedures.ts, before calling agent.chat():
const memContext = await runtime.memory.getMemoryContext(userText);
const augmented = memContext
  ? `<memory_context>\n${memContext}\n</memory_context>\n\n${userText}`
  : userText;
```

This is non-invasive — the agent sees memory context as part of the message.

### 4. Update runtime.ts

- Remove old tool imports (`createRememberTool`, `createRecallTool`, `createListMemoriesTool`, `createSearchMemoriesTool`, `createForgetTool`)
- Add new tool imports (`createMemoryWriteTool`, `createMemorySearchTool`, `createMemoryReadTool`, `createMemoryDeleteTool`)
- Replace `## Memory\n${memoryContext}` in system prompt with the `MEMORY_GUIDE` template (which includes MEMORY.md content)
- Pass memory config to MemoryManager constructor

### 5. Update procedures.ts

- In `chat.stream`, augment user message with memory context before calling agent.chat()
- Similar augmentation for cron tasks and webhook tasks

### 6. Update bundled skill docs

- `src/engine/skills/bundled/sa/docs/tools.md` — replace old 5-tool docs with new 3+1 tools
- `src/engine/skills/bundled/sa/docs/configuration.md` — add memory config section
- `src/engine/skills/bundled/sa/SKILL.md` — update tool list

## Files to change

- `src/engine/tools/memory-write.ts` (create — replaces remember.ts)
- `src/engine/tools/memory-search.ts` (create — replaces search-memories.ts)
- `src/engine/tools/memory-read.ts` (create — replaces recall.ts)
- `src/engine/tools/memory-delete.ts` (create — replaces forget.ts)
- `src/engine/tools/remember.ts` (delete)
- `src/engine/tools/recall.ts` (delete)
- `src/engine/tools/search-memories.ts` (delete)
- `src/engine/tools/list-memories.ts` (delete)
- `src/engine/tools/forget.ts` (delete)
- `src/engine/tools/index.ts` (modify — update exports)
- `src/engine/memory/manager.ts` (modify — add getMemoryContext method)
- `src/engine/runtime.ts` (modify — swap tool registrations, update system prompt)
- `src/engine/procedures.ts` (modify — augment user messages with memory context)
- `src/engine/skills/bundled/sa/docs/tools.md` (modify — update memory tool docs)
- `src/engine/skills/bundled/sa/docs/configuration.md` (modify — add memory config docs)
- `src/engine/skills/bundled/sa/SKILL.md` (modify — update tool list)
- `tests/tools/memory-tools.test.ts` (rewrite — test new tool surface)
- `tests/memory-integration.test.ts` (create — test dynamic memory injection)

## Verification

- Run: `bun test tests/tools/memory-tools.test.ts tests/memory-integration.test.ts`
- Expected: All new tool tests pass, memory injection works correctly
- Run: `bun test` (full suite)
- Expected: All tests pass — no regressions from tool rename
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Edge cases:
  - memory_write without key → appends to journal
  - memory_search with no results → returns "No relevant memories found"
  - memory_read with non-existent key → returns not-found message
  - Dynamic injection with empty memory → no context block prepended
  - Journal auto-write guidance in system prompt → agent writes journal entries
  - Old tool names (remember, recall, etc.) no longer registered → agent adapts to new names

## Progress
- Created 4 new memory tool files: memory-write.ts, memory-search.ts, memory-read.ts, memory-delete.ts
- Deleted 5 old tool files: remember.ts, recall.ts, search-memories.ts, list-memories.ts, forget.ts
- Updated tools/index.ts exports
- Updated runtime.ts: new imports, MEMORY_GUIDE constant, embedding config wiring, search weights
- Added getMemoryContext() to MemoryManager for dynamic memory injection
- Updated procedures.ts: dynamic memory injection with <memory_context> block
- Updated skill docs (tools.md, configuration.md, SKILL.md)
- Rewrote memory-tools.test.ts (14 tests), created memory-integration.test.ts (6 tests)
- Fixed e2e smoke.test.ts to use new memory tool imports
- Modified: src/engine/tools/{memory-write,memory-search,memory-read,memory-delete}.ts, src/engine/tools/index.ts, src/engine/memory/manager.ts, src/engine/runtime.ts, src/engine/procedures.ts, src/engine/skills/bundled/sa/docs/tools.md, src/engine/skills/bundled/sa/docs/configuration.md, src/engine/skills/bundled/sa/SKILL.md, tests/tools/memory-tools.test.ts, tests/memory-integration.test.ts, tests/e2e/smoke.test.ts
- Verification: 505 tests pass, typecheck clean, lint clean
