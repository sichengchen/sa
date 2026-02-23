---
id: 85
title: Vector embeddings + hybrid search with temporal decay
status: done
type: feature
priority: 2
phase: 007-memory-redesign
branch: feature/007-memory-redesign
created: 2026-02-22
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/20
---
# Vector embeddings + hybrid search with temporal decay

## Context

Plan 084 delivers BM25 full-text search via FTS5. This plan adds optional vector (semantic) search on top. Plan 087 adds `type: "embedding"` to `ModelConfig` and lets users configure embedding models through the wizard/config editor — this plan uses that model config to resolve the provider, model ID, and API key via the existing `ModelRouter`. The system must work fully without vectors — this is an enhancement.

BM25 is great for exact keyword matches but weak at semantic similarity ("my address" won't match content about "123 Example St"). Vector search fills this gap.

Bun's built-in SQLite can store float arrays as blobs. For the scale of a personal assistant's memory (<10K chunks), in-process cosine similarity over stored embeddings is fast enough — no sqlite-vec extension needed.

## Approach

### 1. Embedding via ModelRouter

Add an `embed()` method to `ModelRouter` that resolves the embedding model from config — same pattern as `getModel()` for chat:

```typescript
// In ModelRouter:
async embed(texts: string[]): Promise<{ vectors: number[][]; dimensions: number }> {
  const embeddingModel = this.getEmbeddingConfig(); // finds model with type: "embedding"
  if (!embeddingModel) throw new Error("No embedding model configured");
  const provider = this.getProvider(embeddingModel.provider);
  const apiKey = this.resolveApiKey(provider.apiKeyEnvVar);
  // Dispatch to provider-specific endpoint
}
```

The user configures embedding models via `config.json` models array (same as chat models, with `type: "embedding"`) — no separate `memory.embeddings` config needed. Plan 087 adds the wizard/config UI for this.

Provider endpoint dispatch (based on `provider.type`):
- **openai / openrouter / nvidia / openai-compat**: `POST {baseUrl}/v1/embeddings` (OpenAI-compatible)
- **google**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent`
- **anthropic**: No embeddings — users configure a separate provider (OpenAI, Voyage, etc.)

If no model with `type: "embedding"` exists in config, vector search is silently disabled and BM25 carries the load.

### 2. SQLite schema additions

Add to existing `.index.sqlite` from Plan 084:

```sql
-- Embeddings table: stores vectors alongside chunks
CREATE TABLE embeddings (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  vector BLOB NOT NULL,          -- float32 array stored as blob
  provider TEXT NOT NULL,         -- "openai" | "google" | "voyage"
  model TEXT NOT NULL,            -- e.g. "text-embedding-3-small"
  dimensions INTEGER NOT NULL
);

-- Track embedding config for reindex detection
-- (stored in meta table: embedding_provider, embedding_model)
```

### 3. Embedding lifecycle

- **On save/append**: After chunking and FTS5 indexing, queue chunks for embedding
- **Batch embedding**: Embed all queued chunks in a single API call (providers support batch input)
- **On delete**: Embeddings cascade-deleted via foreign key
- **On reindex**: If provider/model changed (detected via meta table), clear all embeddings and re-embed
- **Lazy embedding**: If embedding fails (API error, no key), log warning and continue — BM25 still works

### 4. Hybrid search

When vector search is available, `search()` runs both retrieval paths and merges:

```
1. BM25: query FTS5, get top N*3 results with BM25 rank
2. Vector: embed query, cosine similarity against stored embeddings, get top N*3 results
3. Normalize scores:
   - BM25: textScore = 1 / (1 + max(0, bm25Rank))
   - Vector: vectorScore = cosineSimilarity (already 0..1)
4. Union by chunk_id, compute:
   finalScore = vectorWeight * vectorScore + textWeight * textScore
   (default weights: vector 0.6, text 0.4)
5. Sort by finalScore descending, return top N
```

When vectors are unavailable, fall back to BM25-only (same as Plan 084).

### 5. Temporal decay

Apply exponential decay to journal entries based on file date:

```
decayedScore = score * e^(-λ * ageInDays)
where λ = ln(2) / halfLifeDays
```

- Default half-life: 30 days (score halves every 30 days)
- **Evergreen files never decay**: MEMORY.md, topics/*.md (multiplier = 1.0)
- **Journal files**: Extract date from filename (`YYYY-MM-DD.md`), compute age
- Applied after hybrid merge, before final sort

### 6. Cosine similarity in JS

For <10K vectors, in-process cosine similarity is fast enough:

```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

Store vectors as `Float32Array` → `Buffer` for SQLite blob storage.

### 7. Config

Embedding model is configured in the `models` array (not under `memory`):
```json
{
  "name": "embed",
  "provider": "openai",
  "model": "text-embedding-3-small",
  "type": "embedding"
}
```

Search tuning stays under `memory.search`:
```typescript
memory: {
  // ... existing from Plan 084
  search: {
    maxResults: number;
    vectorWeight?: number;    // default: 0.6
    textWeight?: number;      // default: 0.4
    temporalDecay?: {
      enabled: boolean;       // default: true
      halfLifeDays: number;   // default: 30
    };
  };
};
```

## Files to change

- `src/engine/router/router.ts` (modify — add `embed()` method, `getEmbeddingConfig()`)
- `src/engine/router/types.ts` (modify — `type` field already added by Plan 087)
- `src/engine/memory/manager.ts` (modify — add vector storage, hybrid search, temporal decay)
- `src/engine/memory/types.ts` (modify — add SearchResult.vectorScore)
- `src/engine/config/types.ts` (modify — add search weights, temporal decay to memory config)
- `src/engine/config/defaults.ts` (modify — add search weight defaults)
- `src/engine/runtime.ts` (modify — pass router to MemoryManager for embedding access)
- `tests/memory-embeddings.test.ts` (create — embedding client tests with mocked HTTP)
- `tests/memory-hybrid-search.test.ts` (create — hybrid merge + temporal decay tests)

## Verification

- Run: `bun test tests/memory-embeddings.test.ts tests/memory-hybrid-search.test.ts`
- Expected: All tests pass including hybrid merge logic, temporal decay math, score normalization
- Run: `bun run typecheck && bun run lint`
- Expected: Clean
- Edge cases:
  - No embedding provider configured → BM25-only, no errors
  - Embedding API returns error → log warning, fall back to BM25
  - Provider/model changes → reindex triggers re-embedding
  - Empty query → no vector search, BM25 only
  - All journal entries >180 days old → temporal decay makes them near-zero but still findable
  - Mixed results: some chunks have embeddings, some don't → union correctly

## Progress
- Added `type?: "chat" | "embedding"` to ModelConfig in router/types.ts
- Added embed(), getEmbeddingConfig(), hasEmbedding(), embedOpenAI(), embedGoogle() to ModelRouter
- Added embeddings table to SQLite schema with FK cascade to chunks
- Implemented cosine similarity with Float32Array ↔ Uint8Array blob storage
- Added setEmbedding() with provider/model change detection and lazy re-embedding
- Implemented hybrid search: BM25 + vector weighted merge in async searchIndex()
- Implemented temporal decay for journal entries (evergreen files exempt)
- Added setSearchWeights() for configuring vectorWeight, textWeight, temporalDecay
- Expanded config types with vectorWeight, textWeight, temporalDecay settings + defaults
- Exported EmbedFn, EmbeddingConfig from memory/index.ts
- Updated existing tests for async searchIndex()
- Created 6 embedding tests (storage, auto-embed, config change, fallback, BM25-only)
- Created 9 hybrid search + temporal decay tests (merge, weights, half-life math, evergreen, ancient)
- Modified: router/router.ts, router/types.ts, memory/manager.ts, memory/types.ts, memory/index.ts, config/types.ts, config/defaults.ts, tests/memory.test.ts
- Created: tests/memory-embeddings.test.ts, tests/memory-hybrid-search.test.ts
- Note: runtime.ts not modified — embedding config is injected via setEmbedding() after init, wiring will happen in Plan 086 (agent integration)
- Verification: typecheck clean, lint clean, 493 tests pass (0 fail)
