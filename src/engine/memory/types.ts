export interface MemoryEntry {
  key: string;
  content: string;
  updatedAt: number;
  layer?: MemoryLayer;
}

export type MemoryLayer = "profile" | "project" | "operational" | "journal";

/** A ranked search result from the memory index. */
export interface SearchResult {
  /** File path relative to memory dir (e.g. "topics/user-address.md") */
  source: string;
  /** Source classification */
  sourceType: "memory" | "profile" | "project" | "operational" | "journal";
  /** Chunk text (snippet) */
  content: string;
  /** First line of this chunk in the source file (1-indexed) */
  lineStart: number;
  /** Last line of this chunk in the source file (1-indexed) */
  lineEnd: number;
  /** Combined relevance score (higher = more relevant) */
  score: number;
  /** Vector similarity score (0..1), present when embedding search was used */
  vectorScore?: number;
  /** Unix timestamp of last update */
  updatedAt: number;
}

/** Options for memory search. */
export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  maxResults?: number;
  /** Filter by source type (default: "all") */
  sourceType?: "memory" | "profile" | "project" | "operational" | "journal" | "all";
}

/** Embedding function callback type */
export type EmbedFn = (texts: string[]) => Promise<{ vectors: number[][]; dimensions: number }>;

/** Embedding configuration for MemoryManager */
export interface EmbeddingConfig {
  /** Function to embed text into vectors */
  embed: EmbedFn;
  /** Provider name (for tracking reindex needs) */
  provider: string;
  /** Model name (for tracking reindex needs) */
  model: string;
}
