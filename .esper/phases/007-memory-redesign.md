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
