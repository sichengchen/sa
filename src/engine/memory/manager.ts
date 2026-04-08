import { readFile, writeFile, readdir, unlink, mkdir, stat, appendFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import type { MemoryEntry, MemoryLayer, SearchResult, SearchOptions, EmbeddingConfig } from "./types.js";
import { chunkMarkdown } from "./chunker.js";

const MAX_MEMORY_LINES = 200;
const MAX_LAYER_ENTRIES = 8;
const MAX_LAYER_ENTRY_CHARS = 400;
const MAX_RETRIEVAL_SNIPPET_CHARS = 300;
const LAYER_DIRECTORY_MAP: Record<Exclude<MemoryLayer, "journal">, string> = {
  profile: "profile",
  project: "project",
  operational: "operational",
};

// Default search weights
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_TEXT_WEIGHT = 0.4;
const DEFAULT_HALF_LIFE_DAYS = 30;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE(source, chunk_index)
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  vector BLOB NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL
);
`;

/** Compute cosine similarity between two vectors */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Convert a number array to a Uint8Array blob for SQLite storage */
function vectorToBlob(vector: number[]): Uint8Array {
  const float32 = new Float32Array(vector);
  return new Uint8Array(float32.buffer);
}

/** Convert a SQLite blob back to a Float32Array */
function blobToVector(blob: Uint8Array): Float32Array {
  const buffer = new ArrayBuffer(blob.byteLength);
  new Uint8Array(buffer).set(blob);
  return new Float32Array(buffer);
}

/** Internal candidate type used during search merge */
interface SearchCandidate {
  chunkId: number;
  source: string;
  sourceType: SearchResult["sourceType"];
  content: string;
  lineStart: number;
  lineEnd: number;
  updatedAt: number;
  textScore: number;
}

export class MemoryManager {
  private memoryDir: string;
  private profileDir: string;
  private projectDir: string;
  private operationalDir: string;
  private journalDir: string;
  private db: Database | null = null;

  // Embedding support
  private embeddingConfig: EmbeddingConfig | null = null;

  // Search weights
  private vectorWeight = DEFAULT_VECTOR_WEIGHT;
  private textWeight = DEFAULT_TEXT_WEIGHT;
  private temporalDecayEnabled = true;
  private halfLifeDays = DEFAULT_HALF_LIFE_DAYS;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
    this.profileDir = join(memoryDir, LAYER_DIRECTORY_MAP.profile);
    this.projectDir = join(memoryDir, LAYER_DIRECTORY_MAP.project);
    this.operationalDir = join(memoryDir, LAYER_DIRECTORY_MAP.operational);
    this.journalDir = join(memoryDir, "journal");
  }

  async init(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await mkdir(this.profileDir, { recursive: true });
    await mkdir(this.projectDir, { recursive: true });
    await mkdir(this.operationalDir, { recursive: true });
    await mkdir(this.journalDir, { recursive: true });

    const mainPath = join(this.memoryDir, "MEMORY.md");
    if (!existsSync(mainPath)) {
      await writeFile(mainPath, "");
    }

    // Open SQLite database with WAL mode for concurrent reads
    const dbPath = join(this.memoryDir, ".index.sqlite");
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(SCHEMA_SQL);

    // Reindex all files on init (catches any changes made while engine was down)
    await this.reindex();
  }

  /** Configure embedding for vector search. Clears embeddings if provider/model changed. */
  async setEmbedding(config: EmbeddingConfig): Promise<void> {
    this.embeddingConfig = config;
    if (!this.db) return;

    // Check if provider/model changed since last time
    const storedProvider = this.getMeta("embedding_provider");
    const storedModel = this.getMeta("embedding_model");

    if (storedProvider !== config.provider || storedModel !== config.model) {
      // Clear all embeddings — need to re-embed with new model
      this.db.exec("DELETE FROM embeddings");
      this.setMeta("embedding_provider", config.provider);
      this.setMeta("embedding_model", config.model);
    }

    // Embed any chunks that don't have embeddings yet
    await this.embedMissingChunks();
  }

  /** Configure search weights and temporal decay */
  setSearchWeights(opts: {
    vectorWeight?: number;
    textWeight?: number;
    temporalDecay?: { enabled?: boolean; halfLifeDays?: number };
  }): void {
    if (opts.vectorWeight !== undefined) this.vectorWeight = opts.vectorWeight;
    if (opts.textWeight !== undefined) this.textWeight = opts.textWeight;
    if (opts.temporalDecay?.enabled !== undefined) this.temporalDecayEnabled = opts.temporalDecay.enabled;
    if (opts.temporalDecay?.halfLifeDays !== undefined) this.halfLifeDays = opts.temporalDecay.halfLifeDays;
  }

  /** Load MEMORY.md content for system prompt injection (truncated to MAX_MEMORY_LINES) */
  async loadContext(): Promise<string> {
    const mainPath = join(this.memoryDir, "MEMORY.md");
    if (!existsSync(mainPath)) return "";

    const content = await readFile(mainPath, "utf-8");
    const lines = content.split("\n");
    if (lines.length > MAX_MEMORY_LINES) {
      return lines.slice(0, MAX_MEMORY_LINES).join("\n") + "\n...(truncated)";
    }
    return content;
  }

  /** Load layered memory context for prompt assembly. */
  async loadLayeredContext(): Promise<string> {
    const sections: string[] = [];
    const curated = await this.loadContext();
    if (curated.trim()) {
      sections.push(`## Curated Memory\n${curated}`);
    }

    const profile = await this.formatLayerContext("profile", "Profile Memory");
    if (profile) sections.push(profile);

    const project = await this.formatLayerContext("project", "Project Memory");
    if (project) sections.push(project);

    const operational = await this.formatLayerContext("operational", "Operational Memory");
    if (operational) sections.push(operational);

    return sections.join("\n\n");
  }

  /** Save or update a project memory entry. Writes to project/<key>.md and updates index. */
  async save(key: string, content: string): Promise<void> {
    await this.saveLayer("project", key, content);
  }

  /** Save or update a specific memory layer entry. */
  async saveLayer(layer: Exclude<MemoryLayer, "journal">, key: string, content: string): Promise<void> {
    const safeName = this.sanitizeKey(key);
    const layerDir = this.getLayerDir(layer);
    const filePath = join(layerDir, `${safeName}.md`);
    await writeFile(filePath, content);
    const source = `${LAYER_DIRECTORY_MAP[layer]}/${safeName}.md`;
    await this.indexFile(source, layer, content);
  }

  /** Search across all memory files using FTS5 BM25. Returns MemoryEntry[] for backward compat. */
  async search(query: string): Promise<MemoryEntry[]> {
    const results = await this.searchIndex(query);
    // Map SearchResult to MemoryEntry for backward compatibility
    return results.map((r) => {
      let key: string;
      if (r.sourceType === "memory") {
        key = "MEMORY";
      } else if (r.sourceType === "project" || r.sourceType === "profile" || r.sourceType === "operational") {
        key = basename(r.source, ".md");
      } else {
        key = r.source.replace(/\.md$/, "");
      }
      return { key, content: r.content, updatedAt: r.updatedAt, layer: this.sourceTypeToLayer(r.sourceType) };
    });
  }

  /**
   * Full-featured search returning ranked SearchResult[].
   * Uses hybrid BM25 + vector search when embeddings are available,
   * with temporal decay for journal entries.
   */
  async searchIndex(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    if (!this.db || !query.trim()) return [];

    const maxResults = opts?.maxResults ?? 10;
    const sourceFilter = opts?.sourceType ?? "all";
    const candidateLimit = maxResults * 3;

    // 1. BM25 search
    const textCandidates = this.bm25Search(query, sourceFilter, candidateLimit);

    // 2. Vector search (if embeddings available)
    let vectorScores = new Map<number, number>();
    if (this.embeddingConfig && this.hasEmbeddings()) {
      try {
        const { vectors } = await this.embeddingConfig.embed([query]);
        if (vectors.length > 0 && vectors[0].length > 0) {
          const queryVector = new Float32Array(vectors[0]);
          vectorScores = this.vectorSearchByChunk(queryVector, sourceFilter, candidateLimit);
        }
      } catch {
        // Vector search failed — BM25 only
      }
    }

    // 3. If no vector scores, return BM25-only results
    if (vectorScores.size === 0) {
      const results: SearchResult[] = textCandidates.slice(0, maxResults).map((c) => ({
        source: c.source,
        sourceType: c.sourceType,
        content: c.content,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        score: c.textScore,
        updatedAt: c.updatedAt,
      }));
      return this.applyTemporalDecay(results);
    }

    // 4. Hybrid merge
    const vw = this.vectorWeight;
    const tw = this.textWeight;

    const textMap = new Map(textCandidates.map((c) => [c.chunkId, c]));
    const allIds = new Set<number>([
      ...textCandidates.map((c) => c.chunkId),
      ...vectorScores.keys(),
    ]);

    const merged: SearchResult[] = [];
    for (const id of allIds) {
      const textCandidate = textMap.get(id);
      const vScore = vectorScores.get(id) ?? 0;
      const tScore = textCandidate?.textScore ?? 0;
      const finalScore = vw * vScore + tw * tScore;

      // Use BM25 candidate data, or load from DB for vector-only results
      const data = textCandidate ?? this.getChunkById(id);
      if (!data) continue;

      merged.push({
        source: data.source,
        sourceType: data.sourceType,
        content: data.content,
        lineStart: data.lineStart,
        lineEnd: data.lineEnd,
        score: finalScore,
        vectorScore: vScore > 0 ? vScore : undefined,
        updatedAt: data.updatedAt,
      });
    }

    merged.sort((a, b) => b.score - a.score);
    return this.applyTemporalDecay(merged.slice(0, maxResults));
  }

  /** Read a specific memory entry by project memory key */
  async get(key: string): Promise<string | null> {
    return this.getLayer("project", key);
  }

  async getLayer(layer: Exclude<MemoryLayer, "journal">, key: string): Promise<string | null> {
    const safeName = this.sanitizeKey(key);
    const filePath = join(this.getLayerDir(layer), `${safeName}.md`);
    if (!existsSync(filePath)) return null;
    return readFile(filePath, "utf-8");
  }

  /** Delete a memory entry by project memory key */
  async delete(key: string): Promise<boolean> {
    return this.deleteLayer("project", key);
  }

  async deleteLayer(layer: Exclude<MemoryLayer, "journal">, key: string): Promise<boolean> {
    const safeName = this.sanitizeKey(key);
    const filePath = join(this.getLayerDir(layer), `${safeName}.md`);
    if (!existsSync(filePath)) return false;
    await unlink(filePath);
    const source = `${LAYER_DIRECTORY_MAP[layer]}/${safeName}.md`;
    this.removeFromIndex(source);
    return true;
  }

  /** List all project memory keys */
  async list(): Promise<string[]> {
    return this.listLayer("project");
  }

  async listLayer(layer: Exclude<MemoryLayer, "journal">): Promise<string[]> {
    const keys: string[] = [];
    const layerDir = this.getLayerDir(layer);
    if (!existsSync(layerDir)) return keys;
    const files = await readdir(layerDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        keys.push(file.replace(/\.md$/, ""));
      }
    }
    return keys;
  }

  async listJournalDates(limit = 10): Promise<string[]> {
    if (!existsSync(this.journalDir)) return [];
    const files = await readdir(this.journalDir);
    return files
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);
  }

  /**
   * Get relevant memory context for a user query.
   * Searches across all memory and returns formatted snippets + today's journal.
   * Used for dynamic memory injection before agent chat turns.
   */
  async getMemoryContext(query: string): Promise<string> {
    const parts: string[] = [];

    // Search for relevant snippets
    if (query.trim()) {
      const results = await this.searchIndex(query, { maxResults: 5 });
      if (results.length > 0) {
        const grouped = new Map<SearchResult["sourceType"], string[]>();
        for (const result of results) {
          const snippet = result.content.length > MAX_RETRIEVAL_SNIPPET_CHARS
            ? result.content.slice(0, MAX_RETRIEVAL_SNIPPET_CHARS) + "..."
            : result.content;
          const current = grouped.get(result.sourceType) ?? [];
          current.push(`[${result.source}] ${snippet}`);
          grouped.set(result.sourceType, current);
        }

        const layerOrder: Array<[SearchResult["sourceType"], string]> = [
          ["profile", "Profile memory"],
          ["project", "Project memory"],
          ["operational", "Operational memory"],
          ["memory", "Curated memory"],
          ["journal", "Journal memory"],
        ];
        for (const [sourceType, label] of layerOrder) {
          const entries = grouped.get(sourceType);
          if (entries && entries.length > 0) {
            parts.push(`[${label}]\n${entries.join("\n")}`);
          }
        }
      }
    }

    // Include today's journal if it exists
    const today = new Date().toISOString().slice(0, 10);
    const journal = await this.getJournal(today);
    if (journal) {
      const truncated = journal.length > 500 ? journal.slice(0, 500) + "..." : journal;
      parts.push(`[Today's journal — ${today}]\n${truncated}`);
    }

    return parts.join("\n\n");
  }

  /** Append content to today's journal entry (creates file if needed) */
  async appendJournal(content: string, date?: string): Promise<void> {
    const dateStr = date ?? new Date().toISOString().slice(0, 10);
    const filePath = join(this.journalDir, `${dateStr}.md`);

    if (existsSync(filePath)) {
      await appendFile(filePath, `\n\n${content}`);
    } else {
      await writeFile(filePath, content);
    }

    // Re-index this journal file
    const fullContent = await readFile(filePath, "utf-8");
    const source = `journal/${dateStr}.md`;
    await this.indexFile(source, "journal", fullContent);
  }

  /** Read a specific day's journal */
  async getJournal(date: string): Promise<string | null> {
    const filePath = join(this.journalDir, `${date}.md`);
    if (!existsSync(filePath)) return null;
    return readFile(filePath, "utf-8");
  }

  /** Full re-index of all memory files. Clears stale entries, indexes all current files. */
  async reindex(): Promise<void> {
    if (!this.db) return;

    // Collect all current sources from filesystem
    const currentSources = new Map<string, { type: SearchResult["sourceType"]; path: string }>();

    // MEMORY.md
    const mainPath = join(this.memoryDir, "MEMORY.md");
    if (existsSync(mainPath)) {
      currentSources.set("MEMORY.md", { type: "memory", path: mainPath });
    }

    // layer-backed memory files
    for (const [layer, dirName] of Object.entries(LAYER_DIRECTORY_MAP) as Array<[Exclude<MemoryLayer, "journal">, string]>) {
      const fullDir = join(this.memoryDir, dirName);
      if (!existsSync(fullDir)) continue;
      const files = await readdir(fullDir);
      for (const f of files) {
        if (f.endsWith(".md")) {
          currentSources.set(`${dirName}/${f}`, { type: layer, path: join(fullDir, f) });
        }
      }
    }

    // journal/
    if (existsSync(this.journalDir)) {
      const journalFiles = await readdir(this.journalDir);
      for (const f of journalFiles) {
        if (f.endsWith(".md")) {
          currentSources.set(`journal/${f}`, { type: "journal", path: join(this.journalDir, f) });
        }
      }
    }

    // Get indexed sources and their timestamps
    const indexed = new Map<string, number>();
    const rows = this.db.prepare(
      "SELECT DISTINCT source, MAX(updated_at) as updated_at FROM chunks GROUP BY source"
    ).all() as Array<{ source: string; updated_at: number }>;
    for (const row of rows) {
      indexed.set(row.source, row.updated_at);
    }

    // Remove stale (deleted files)
    for (const source of indexed.keys()) {
      if (!currentSources.has(source)) {
        this.removeFromIndex(source);
      }
    }

    // Index new or modified files
    for (const [source, info] of currentSources) {
      const fileStat = await stat(info.path);
      const fileMtime = Math.floor(fileStat.mtimeMs);
      const indexedAt = indexed.get(source);

      if (indexedAt === undefined || fileMtime > indexedAt) {
        const content = await readFile(info.path, "utf-8");
        await this.indexFile(source, info.type, content);
      }
    }
  }

  /** Close the database (for clean shutdown) */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --- Private helpers ---

  /** Chunk and index a file's content, optionally embedding the chunks */
  private async indexFile(source: string, sourceType: SearchResult["sourceType"], content: string): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const chunks = chunkMarkdown(content);

    // Remove existing chunks for this source (cascades to embeddings via FK)
    this.removeFromIndex(source);

    if (chunks.length === 0) return;

    const insert = this.db.prepare(
      `INSERT INTO chunks (source, source_type, chunk_index, content, line_start, line_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertedIds: number[] = [];
    const tx = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const info = insert.run(source, sourceType, i, chunks[i].content, chunks[i].lineStart, chunks[i].lineEnd, now);
        insertedIds.push(Number(info.lastInsertRowid));
      }
    });
    tx();

    // Embed chunks if embedding is configured
    if (this.embeddingConfig && insertedIds.length > 0) {
      try {
        await this.embedChunks(insertedIds, chunks.map((c) => c.content));
      } catch (err) {
        // Embedding failed — BM25 still works
        console.warn("Embedding failed for", source, ":", err);
      }
    }
  }

  /** Remove all chunks for a source from the index */
  private removeFromIndex(source: string): void {
    if (!this.db) return;
    this.db.prepare("DELETE FROM chunks WHERE source = ?").run(source);
  }

  /** Sanitize a search query for FTS5 MATCH syntax */
  private sanitizeFtsQuery(query: string): string {
    // Split into tokens, escape each, join with implicit AND
    const tokens = query
      .replace(/['"]/g, "") // strip quotes
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => `"${t}"`); // quote each token for exact matching

    return tokens.join(" ");
  }

  /** BM25 full-text search via FTS5 */
  private bm25Search(query: string, sourceFilter: string, limit: number): SearchCandidate[] {
    if (!this.db) return [];

    const sanitized = this.sanitizeFtsQuery(query);
    if (!sanitized) return [];

    try {
      let sql: string;
      const params: (string | number)[] = [];

      if (sourceFilter === "all") {
        sql = `
          SELECT c.id, c.source, c.source_type, c.content, c.line_start, c.line_end,
                 c.updated_at, rank
          FROM chunks_fts f
          JOIN chunks c ON c.id = f.rowid
          WHERE chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `;
        params.push(sanitized, limit);
      } else {
        sql = `
          SELECT c.id, c.source, c.source_type, c.content, c.line_start, c.line_end,
                 c.updated_at, rank
          FROM chunks_fts f
          JOIN chunks c ON c.id = f.rowid
          WHERE chunks_fts MATCH ? AND c.source_type = ?
          ORDER BY rank
          LIMIT ?
        `;
        params.push(sanitized, sourceFilter, limit);
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: number;
        source: string;
        source_type: string;
        content: string;
        line_start: number;
        line_end: number;
        updated_at: number;
        rank: number;
      }>;

      return rows.map((row) => ({
        chunkId: row.id,
        source: row.source,
        sourceType: row.source_type as SearchResult["sourceType"],
        content: row.content,
        lineStart: row.line_start,
        lineEnd: row.line_end,
        updatedAt: row.updated_at,
        textScore: 1 / (1 + Math.max(0, -row.rank)),
      }));
    } catch {
      return [];
    }
  }

  /** Vector similarity search — loads embeddings and computes cosine similarity */
  private vectorSearchByChunk(queryVector: Float32Array, sourceFilter: string, limit: number): Map<number, number> {
    if (!this.db) return new Map();

    let sql: string;
    const params: string[] = [];

    if (sourceFilter === "all") {
      sql = "SELECT e.chunk_id, e.vector FROM embeddings e";
    } else {
      sql = `
        SELECT e.chunk_id, e.vector
        FROM embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        WHERE c.source_type = ?
      `;
      params.push(sourceFilter);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{ chunk_id: number; vector: Uint8Array }>;

    const scores: Array<{ chunkId: number; score: number }> = [];
    for (const row of rows) {
      const storedVector = blobToVector(row.vector);
      if (storedVector.length !== queryVector.length) continue;
      const score = cosineSimilarity(queryVector, storedVector);
      scores.push({ chunkId: row.chunk_id, score });
    }

    scores.sort((a, b) => b.score - a.score);

    const result = new Map<number, number>();
    for (const s of scores.slice(0, limit)) {
      result.set(s.chunkId, s.score);
    }
    return result;
  }

  /** Load a chunk's data by ID (for vector-only results not in BM25 results) */
  private getChunkById(id: number): SearchCandidate | null {
    if (!this.db) return null;

    const row = this.db.prepare(
      "SELECT id, source, source_type, content, line_start, line_end, updated_at FROM chunks WHERE id = ?"
    ).get(id) as {
      id: number;
      source: string;
      source_type: string;
      content: string;
      line_start: number;
      line_end: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      chunkId: row.id,
      source: row.source,
      sourceType: row.source_type as SearchResult["sourceType"],
      content: row.content,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      updatedAt: row.updated_at,
      textScore: 0,
    };
  }

  /** Check if any embeddings exist in the database */
  private hasEmbeddings(): boolean {
    if (!this.db) return false;
    const row = this.db.prepare("SELECT COUNT(*) as count FROM embeddings").get() as { count: number };
    return row.count > 0;
  }

  /** Embed texts and store vectors for the given chunk IDs */
  private async embedChunks(chunkIds: number[], texts: string[]): Promise<void> {
    if (!this.db || !this.embeddingConfig) return;

    const { vectors, dimensions } = await this.embeddingConfig.embed(texts);

    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO embeddings (chunk_id, vector, provider, model, dimensions) VALUES (?, ?, ?, ?, ?)"
    );

    const provider = this.embeddingConfig.provider;
    const model = this.embeddingConfig.model;

    const tx = this.db.transaction(() => {
      for (let i = 0; i < chunkIds.length; i++) {
        insert.run(chunkIds[i], vectorToBlob(vectors[i]), provider, model, dimensions);
      }
    });
    tx();
  }

  /** Embed all chunks that don't have embeddings yet */
  private async embedMissingChunks(): Promise<void> {
    if (!this.db || !this.embeddingConfig) return;

    const missing = this.db.prepare(
      "SELECT id, content FROM chunks WHERE id NOT IN (SELECT chunk_id FROM embeddings)"
    ).all() as Array<{ id: number; content: string }>;

    if (missing.length === 0) return;

    try {
      // Batch in groups of 100 to avoid oversized API requests
      const batchSize = 100;
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        await this.embedChunks(
          batch.map((c) => c.id),
          batch.map((c) => c.content),
        );
      }
    } catch (err) {
      console.warn("Failed to embed missing chunks:", err);
    }
  }

  /** Apply temporal decay to journal entries (evergreen files unaffected) */
  private applyTemporalDecay(results: SearchResult[]): SearchResult[] {
    if (!this.temporalDecayEnabled) return results;

    const now = Date.now();
    const lambda = Math.log(2) / this.halfLifeDays;

    const decayed = results.map((r) => {
      // Evergreen files never decay
      if (r.sourceType === "memory" || r.sourceType === "profile" || r.sourceType === "project" || r.sourceType === "operational") return r;

      // Journal files: extract date from source filename
      const dateMatch = r.source.match(/(\d{4}-\d{2}-\d{2})\.md$/);
      if (!dateMatch) return r;

      const fileDate = new Date(dateMatch[1]).getTime();
      const ageInDays = (now - fileDate) / (1000 * 60 * 60 * 24);
      const multiplier = Math.exp(-lambda * ageInDays);

      return { ...r, score: r.score * multiplier };
    });

    // Re-sort after decay
    decayed.sort((a, b) => b.score - a.score);
    return decayed;
  }

  /** Read a value from the meta table */
  private getMeta(key: string): string | null {
    if (!this.db) return null;
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /** Write a value to the meta table */
  private setMeta(key: string, value: string): void {
    if (!this.db) return;
    this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private getLayerDir(layer: Exclude<MemoryLayer, "journal">): string {
    switch (layer) {
      case "profile":
        return this.profileDir;
      case "project":
        return this.projectDir;
      case "operational":
        return this.operationalDir;
    }
  }

  private sourceTypeToLayer(sourceType: SearchResult["sourceType"]): MemoryLayer | undefined {
    switch (sourceType) {
      case "profile":
      case "project":
      case "operational":
      case "journal":
        return sourceType;
      default:
        return undefined;
    }
  }

  private async formatLayerContext(layer: Exclude<MemoryLayer, "journal">, title: string): Promise<string> {
    const entries = await this.listLayer(layer);
    if (entries.length === 0) return "";

    const snippets: string[] = [];
    for (const key of entries.slice(0, MAX_LAYER_ENTRIES)) {
      const content = await this.getLayer(layer, key);
      if (!content) continue;
      const snippet = content.length > MAX_LAYER_ENTRY_CHARS
        ? `${content.slice(0, MAX_LAYER_ENTRY_CHARS)}...`
        : content;
      snippets.push(`- ${key}: ${snippet}`);
    }

    return snippets.length > 0 ? `## ${title}\n${snippets.join("\n")}` : "";
  }
}
