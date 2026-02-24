# Memory Tools

Four tools for persistent, searchable agent memory. Memory is stored in the
SA home directory (`~/.sa/memory/`).

---

## memory_write

Write to topic files or the daily journal.

### Parameters

| Parameter | Type   | Required | Default   | Description                        |
|-----------|--------|----------|-----------|------------------------------------|
| content   | string | yes      | —         | Markdown content to write          |
| key       | string | no       | —         | Topic key (slug)                   |
| type      | string | no       | "topic"   | `"topic"` or `"journal"`           |

### Behavior

- **With key**: saves to `topics/<key>.md` (upsert — creates or overwrites).
- **Without key**: appends to `journal/YYYY-MM-DD.md` (today's date).

---

## memory_search

Hybrid BM25 + semantic search across memory.

### Parameters

| Parameter | Type   | Required | Default | Description                              |
|-----------|--------|----------|---------|------------------------------------------|
| query     | string | yes      | —       | Search query                             |
| source    | string | no       | "all"   | `"all"`, `"topics"`, `"journal"`, `"memory"` |
| limit     | number | no       | 5       | Max results                              |

### Returns

Ranked snippets with:
- **source** — file path relative to memory directory
- **line ranges** — start and end line numbers
- **scores** — BM25 and vector similarity scores

---

## memory_read

Read a full memory entry.

### Parameters

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| key       | string | yes      | Topic key or journal date (YYYY-MM-DD)   |

Returns the full file content of `topics/<key>.md` or `journal/<date>.md`.

---

## memory_delete

Delete a topic memory entry.

### Parameters

| Parameter | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| key       | string | yes      | Topic key to delete|

Deletes `topics/<key>.md` only. Does not delete journal entries or `MEMORY.md`.

---

## Memory Directory Structure

```
~/.sa/memory/
  MEMORY.md              # Curated by user, injected into system prompt
  topics/                # Topic files managed by memory_write
    <key>.md
  journal/               # Daily append-only journal
    YYYY-MM-DD.md
  .index.sqlite          # Search index (FTS5 + optional vector embeddings)
```

### MEMORY.md

User-curated file injected into every system prompt. The agent can read it
but should not write to it — topic and journal writes go to their respective
subdirectories.

### Search Index

`.index.sqlite` contains:
- **FTS5** full-text index for BM25 scoring
- **Optional vector embeddings** for semantic similarity (when an embedding
  model is configured)

The index is rebuilt automatically when memory files change.

---

## Config

```json
{
  "runtime": {
    "memory": {
      "enabled": true,
      "search": {
        "maxResults": 10,
        "vectorWeight": 0.5,
        "textWeight": 0.5,
        "temporalDecay": 0.95
      }
    }
  }
}
```

| Key            | Default | Description                                |
|----------------|---------|--------------------------------------------|
| enabled        | true    | Enable/disable memory subsystem            |
| maxResults     | 10      | Max search results returned                |
| vectorWeight   | 0.5     | Weight for vector similarity in ranking    |
| textWeight     | 0.5     | Weight for BM25 text score in ranking      |
| temporalDecay  | 0.95    | Decay factor for older entries in ranking  |
