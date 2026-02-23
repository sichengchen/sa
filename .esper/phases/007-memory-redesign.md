---
phase: 007-memory-redesign
title: "Memory Redesign"
status: active
---

# Phase 7: Memory Redesign

## Goal

Ground-up redesign of SA's memory system. The current system is fundamentally broken: keyword-only search, stale context (loaded once at boot), no agent memory instructions, flat data model with no timestamps. This phase delivers a reliable, efficient, AI-native memory system with SQLite-backed hybrid search, journal support, and proper agent integration.

## In Scope

- **Core MemoryManager rewrite**: Replace file-scanning MemoryManager with SQLite-backed index using FTS5 for BM25 full-text search. Markdown files remain source of truth; SQLite index is derived.
- **Journal support**: Add `memory/journal/YYYY-MM-DD.md` daily append-only logs alongside existing `MEMORY.md` and `topics/` files.
- **Markdown chunking**: Split memory files into ~400-token chunks with overlap for granular search results (not full-file returns).
- **Vector embeddings (optional)**: Remote embedding client using provider API keys already configured in model router (OpenAI, Google, Voyage). Hybrid search: BM25 + cosine similarity with weighted merge.
- **Temporal decay**: Exponential recency boost for journal entries; evergreen files (MEMORY.md, topics/) never decay.
- **New tool surface**: Replace 5 tools (`remember`, `recall`, `search_memories`, `list_memories`, `forget`) with 3 clean tools (`memory_write`, `memory_search`, `memory_read`) + optional `memory_delete`.
- **Agent integration overhaul**: System prompt memory instructions, dynamic memory injection (search relevant memory per turn), journal auto-write guidance.
- **Migration**: Transparently re-index existing `topics/` files into new SQLite index. No data loss.
- **Config expansion**: New `memory.search`, `memory.journal` config sections. Embedding models configured via existing models array with `type: "embedding"`.
- **Wizard + config editor redesign**: Onboarding wizard supports multi-model setup (primary + eco + embedding). Config editor models panel categorized by type with tier assignment UI.
- **Tests**: Every plan includes tests for new/changed code.
- **Documentation**: Update bundled skill docs.

## Out of Scope (deferred)

- Local embedding models (GGUF, node-llama-cpp) — violates minimalism principle
- File watchers for index freshness — index-on-write + periodic re-index is sufficient
- Session transcript indexing — premature
- MMR re-ranking / diversity — premature
- Pre-compaction memory flush — requires compaction system (future)
- Session-scoped memory (different memory per connector) — Phase 1 shares memory across all sessions
- Batch embedding APIs — overkill for personal assistant scale

## Acceptance Criteria

- [ ] MemoryManager uses SQLite (bun:sqlite) with FTS5 for search
- [ ] Search returns ranked, chunked snippets (not full files) with source paths
- [ ] BM25 search works with zero external dependencies
- [ ] Journal directory created, daily logs supported
- [ ] Existing `topics/` files migrated into index on first boot
- [ ] Optional vector embeddings via remote provider (OpenAI/Google/Voyage)
- [ ] Hybrid search merges BM25 + vector scores when embeddings configured
- [ ] Temporal decay applied to journal entries (configurable half-life)
- [ ] `memory_write`, `memory_search`, `memory_read` tools replace old 5-tool surface
- [ ] System prompt includes memory usage instructions
- [ ] Agent receives relevant memory context per chat turn (not just at boot)
- [ ] Config supports `memory.search`, `memory.journal`; embedding model in models array with `type: "embedding"`
- [ ] Onboarding wizard supports primary + eco + embedding model setup
- [ ] Config editor models panel shows model types, tier assignments
- [ ] `bun run typecheck`, `bun run lint`, and `bun test` all pass

## Phase Notes

Phase 6 shipped cleanly — no carry-forward. This phase is informed by exploration 006 (Memory System Redesign) which audited the current system and recommended Approach B (full redesign). Key design constraint: BM25-only mode must work standalone; vector search is an enhancement, not a requirement. Uses `bun:sqlite` (zero new deps) for index storage and FTS5.

## Shipped Plans
- Plan 084 — Core MemoryManager rewrite: SQLite FTS5 index, journal support, BM25 search, Markdown chunking, migration. Files: manager.ts, types.ts, chunker.ts, index.ts, config/types.ts, config/defaults.ts, memory.test.ts, memory-chunker.test.ts
- Plan 085 — Vector embeddings + hybrid search with temporal decay: Add embed() to ModelRouter, embeddings SQLite table, hybrid BM25+vector merge, temporal decay for journal entries. Files: router.ts, types.ts, manager.ts, types.ts, index.ts, config/types.ts, config/defaults.ts, memory-embeddings.test.ts, memory-hybrid-search.test.ts
- Plan 086 — New memory tools + agent integration + docs: Replace 5 old tools with 4 clean tools (memory_write, memory_search, memory_read, memory_delete), add MEMORY_GUIDE system prompt, dynamic memory injection per chat turn. Files: memory-write.ts, memory-search.ts, memory-read.ts, memory-delete.ts, index.ts, manager.ts, runtime.ts, procedures.ts, tools.md, configuration.md, SKILL.md
- Plan 087 — Wizard + config redesign for model types + tier routing: Multi-model wizard (primary/eco/embedding), config editor with model categories and tier assignments, expanded memory settings. Files: ModelPicker.tsx, ModelSetup.tsx, Confirm.tsx, Wizard.tsx, ModelManager.tsx, MemorySettings.tsx, ConfigMenu.tsx
- Plan 089 — fix: webhook prompt injection and env-var injection allowlist: Escape `<>`  in webhook payload and wrap with security framing + agent instruction; add BLOCKED_ENV_VARS denylist and validateEnvVarName() to set_env_secret/set_env_variable tools. Files: server.ts, set-api-key.ts, set-api-key.test.ts
- Plan 088 — fix: timing-safe token comparison and session ID entropy: Replace === comparisons with timingSafeEqual in AuthManager; use full 128-bit UUIDs for session IDs. Files: auth.ts, sessions.ts, auth.test.ts, sessions.test.ts
- Plan 090 — fix: ConnectorType Zod enum missing 'cron' and duplicated across modules: Create shared ConnectorTypeSchema as single source of truth; replace inline z.enum in procedures.ts. Files: types.ts, procedures.ts
- Plan 091 — fix: temp dir leak, clearTimeout gap, and silent stream-handler catches: Use rm(dir, recursive) for temp cleanup, move clearTimeout to finally, add console.warn to catches. Files: transcriber.ts, web-fetch.ts, stream-handler.ts
- Plan 092 — fix: add missing tests for agent timeout and memory embedding fallback: Agent timeout tests using mock pi-ai stream; session destroy coverage. Files: agent.test.ts, sessions.test.ts
