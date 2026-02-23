---
id: 84
title: Core MemoryManager rewrite — SQLite FTS5, journal, BM25 search
status: done
type: feature
priority: 1
phase: 007-memory-redesign
branch: feature/007-memory-redesign
created: 2026-02-22
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/20
---
# Core MemoryManager rewrite — SQLite FTS5, journal, BM25 search

## Context

The current `MemoryManager` (`src/engine/memory/manager.ts`, 113 lines) uses file-scanning with `string.includes()` for search. It has no index, no timestamps, no journal, and returns full files instead of relevant snippets. The `updatedAt` field on `MemoryEntry` is always `0`.

Storage is `~/.sa/memory/MEMORY.md` + `topics/<key>.md`. The system prompt gets MEMORY.md content (max 200 lines) injected once at engine boot.

Bun's built-in `bun:sqlite` supports FTS5 out of the box, so we can get BM25 full-text search with zero new dependencies.

## Approach

### 1. New storage layout

Add journal directory alongside existing structure:
```
~/.sa/memory/
├── MEMORY.md              # Curated long-term (unchanged)
├── journal/
│   ├── 2026-02-22.md      # Daily append-only log (new)
│   └── ...
├── topics/                # Structured topic files (unchanged)
│   └── *.md
└── .index.sqlite          # Search index (new)
```

### 2. SQLite schema (`.index.sqlite`)

```sql
-- Chunks table: stores individual chunks from memory files
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,      -- relative file path (e.g. "topics/user-address.md")
  source_type TEXT NOT NULL, -- "memory" | "topic" | "journal"
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  updated_at INTEGER NOT NULL, -- unix timestamp
  UNIQUE(source, chunk_index)
);

-- FTS5 virtual table for BM25 search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Metadata table for tracking index state
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### 3. Markdown chunking

Implement a `chunkMarkdown(content: string, targetTokens?: number, overlap?: number)` function:
- Default target: ~400 tokens (~1600 chars), overlap: ~80 tokens (~320 chars)
- Split on paragraph boundaries (double newline), then merge small paragraphs into chunks
- Each chunk records `line_start` and `line_end` for source attribution
- Returns `{ content: string, lineStart: number, lineEnd: number }[]`

### 4. Rewrite MemoryManager

New class with the same public API surface but SQLite-backed:

- `constructor(memoryDir: string)` — same signature
- `init()` — create dirs + SQLite DB + run migrations + initial index
- `loadContext()` — same (reads MEMORY.md, truncates at 200 lines)
- `save(key: string, content: string)` — write file + update index
- `search(query: string, opts?: SearchOptions)` — BM25 search via FTS5, returns ranked snippets
- `get(key: string)` — same (read file)
- `delete(key: string)` — delete file + remove from index
- `list()` — same (list topic keys)
- `reindex()` — full re-index of all memory files (for migration/repair)
- `appendJournal(content: string, date?: string)` — append to today's journal + index
- `getJournal(date: string)` — read a specific day's journal

New types:
```typescript
interface SearchResult {
  source: string;       // file path relative to memory dir
  sourceType: "memory" | "topic" | "journal";
  content: string;      // chunk text (snippet)
  lineStart: number;
  lineEnd: number;
  score: number;        // BM25 rank score
  updatedAt: number;    // unix timestamp
}

interface SearchOptions {
  maxResults?: number;  // default: 10
  sourceType?: "memory" | "topic" | "journal" | "all"; // default: "all"
}
```

### 5. Index-on-write strategy

- `save()` and `appendJournal()` chunk and index immediately after writing the file
- `delete()` removes chunks for that source
- `reindex()` scans all files, deletes stale chunks, re-chunks changed files (compare `updated_at` vs file mtime)
- `init()` calls `reindex()` on first boot to migrate existing files

### 6. Config types update

Expand `RuntimeConfig.memory`:
```typescript
memory: {
  enabled: boolean;
  directory: string;
  search: {
    maxResults: number;  // default: 10
  };
  journal: {
    enabled: boolean;    // default: true
  };
};
```

(Vector embedding config added in Plan 085.)

### 7. Migration

On `init()`, if `.index.sqlite` doesn't exist:
1. Create the database and schema
2. Scan `MEMORY.md` — chunk and index with `source_type: "memory"`
3. Scan `topics/*.md` — chunk and index with `source_type: "topic"`
4. Scan `journal/*.md` (if any exist) — chunk and index with `source_type: "journal"`

Existing files are not modified. The index is purely derived.

## Files to change

- `src/engine/memory/manager.ts` (rewrite — SQLite-backed MemoryManager)
- `src/engine/memory/types.ts` (modify — add SearchResult, SearchOptions, update MemoryEntry)
- `src/engine/memory/chunker.ts` (create — Markdown chunking utility)
- `src/engine/memory/index.ts` (modify — re-export new types)
- `src/engine/config/types.ts` (modify — expand memory config with search + journal)
- `src/engine/config/defaults.ts` (modify — add defaults for new memory config)
- `tests/memory.test.ts` (rewrite — test new MemoryManager with SQLite)
- `tests/memory-chunker.test.ts` (create — test chunking utility)

## Progress
- Implemented Markdown chunker (chunker.ts) with paragraph-boundary splitting, overlap, line tracking
- Added SearchResult, SearchOptions types to types.ts
- Expanded config types with memory.search.maxResults and memory.journal.enabled
- Rewrote MemoryManager with SQLite FTS5: init creates DB + schema, save/delete update index, search uses BM25
- Added journal support (appendJournal, getJournal)
- Added reindex() for migration and catching external file changes
- Kept backward-compatible search() → MemoryEntry[], added searchIndex() → SearchResult[]
- Created 9 chunker tests and 22 memory manager tests (CRUD, FTS5, journal, reindex, migration)
- Modified: chunker.ts, types.ts, manager.ts, index.ts, config/types.ts, config/defaults.ts, memory.test.ts, memory-chunker.test.ts
- Verification: typecheck clean, lint clean, 478 tests pass (0 fail)

## Verification

- Run: `bun test tests/memory.test.ts tests/memory-chunker.test.ts`
- Expected: All existing memory tests pass (same public API), new FTS5 search tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Edge cases:
  - Empty memory directory (fresh install)
  - Existing topics/ files migrated on first init
  - Very large files (>10KB) chunked correctly
  - Special characters in search queries (FTS5 syntax)
  - Concurrent save + search (SQLite WAL mode handles this)
  - Journal append to non-existent date file (creates it)
