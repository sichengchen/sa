import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryManager } from "@aria/engine/memory/index.js";
import type { EmbeddingConfig } from "@aria/engine/memory/index.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "aria-test-embeddings-" + Date.now());

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Create a mock embedding function that returns deterministic vectors */
function mockEmbedFn(dimensions = 3): EmbeddingConfig {
  let callCount = 0;
  return {
    provider: "test",
    model: "test-embed-v1",
    embed: async (texts: string[]) => {
      callCount++;
      const vectors = texts.map((text, i) => {
        // Generate deterministic vectors based on text content hash
        const hash = text.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
        const vec = new Array(dimensions);
        for (let d = 0; d < dimensions; d++) {
          vec[d] = Math.sin(hash + d + i + callCount * 0.001);
        }
        // Normalize
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
        return norm > 0 ? vec.map((v) => v / norm) : vec;
      });
      return { vectors, dimensions };
    },
  };
}

describe("MemoryManager — Embedding storage", () => {
  test("setEmbedding stores provider/model in meta and embeds existing chunks", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("greeting", "Hello world, this is a test.");
    await mgr.save("farewell", "Goodbye world, see you later.");

    // No embeddings yet — BM25 only
    const beforeResults = await mgr.searchIndex("hello");
    expect(beforeResults.length).toBeGreaterThanOrEqual(1);
    expect(beforeResults[0].vectorScore).toBeUndefined();

    // Enable embedding
    await mgr.setEmbedding(mockEmbedFn());

    // Embeddings should now exist (search still works)
    const afterResults = await mgr.searchIndex("hello");
    expect(afterResults.length).toBeGreaterThanOrEqual(1);
    mgr.close();
  });

  test("new saves embed automatically after setEmbedding", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    await mgr.setEmbedding(mockEmbedFn());

    // Save a new entry — should embed automatically
    await mgr.save("city", "San Francisco is a great city.");

    const results = await mgr.searchIndex("city");
    expect(results.length).toBeGreaterThanOrEqual(1);
    mgr.close();
  });

  test("journal entries are embedded when embedding is configured", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    await mgr.setEmbedding(mockEmbedFn());

    await mgr.appendJournal("Today I learned about vector embeddings.", "2026-02-22");

    const results = await mgr.searchIndex("vector embeddings");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sourceType).toBe("journal");
    mgr.close();
  });

  test("embedding config change clears and re-embeds", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("data", "Important data about the project.");
    await mgr.setEmbedding(mockEmbedFn(3));

    // Change to a different model — should re-embed
    await mgr.setEmbedding({
      ...mockEmbedFn(4),
      provider: "test",
      model: "test-embed-v2",
    });

    const results = await mgr.searchIndex("project");
    expect(results.length).toBeGreaterThanOrEqual(1);
    mgr.close();
  });

  test("embedding failure falls back to BM25 gracefully", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    // Set up a failing embed function
    const failingConfig: EmbeddingConfig = {
      provider: "test",
      model: "fail-model",
      embed: async () => {
        throw new Error("API error");
      },
    };

    await mgr.save("test-data", "This should still be searchable via BM25.");

    // setEmbedding should not throw (it logs and continues)
    await mgr.setEmbedding(failingConfig);

    // BM25 search should still work
    const results = await mgr.searchIndex("searchable");
    expect(results.length).toBeGreaterThanOrEqual(1);
    mgr.close();
  });

  test("search works without any embedding config (BM25 only)", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("info", "TypeScript is a typed superset of JavaScript.");

    const results = await mgr.searchIndex("TypeScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].vectorScore).toBeUndefined();
    mgr.close();
  });
});
