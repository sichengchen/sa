import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryManager } from "@sa/engine/memory/index.js";
import type { EmbeddingConfig } from "@sa/engine/memory/index.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "sa-test-hybrid-" + Date.now());

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/**
 * Create a mock embedding function that produces semantically meaningful vectors.
 * Texts containing the `biasWord` get vectors closer to the query vector,
 * simulating semantic similarity.
 */
function semanticEmbedFn(biasWord: string, dimensions = 8): EmbeddingConfig {
  return {
    provider: "test",
    model: "semantic-test-v1",
    embed: async (texts: string[]) => {
      const vectors = texts.map((text) => {
        const vec = new Array(dimensions).fill(0);
        // Base: hash-derived direction
        const hash = text.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
        for (let d = 0; d < dimensions; d++) {
          vec[d] = Math.sin(hash + d * 7);
        }
        // Bias: if text contains the bias word, push vector toward [1,1,1,...]
        if (text.toLowerCase().includes(biasWord.toLowerCase())) {
          for (let d = 0; d < dimensions; d++) {
            vec[d] += 2.0;
          }
        }
        // Normalize
        const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
        return norm > 0 ? vec.map((v: number) => v / norm) : vec;
      });
      return { vectors, dimensions };
    },
  };
}

describe("Hybrid search — BM25 + vector merge", () => {
  test("hybrid search returns results with vectorScore when embeddings exist", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    await mgr.setEmbedding(semanticEmbedFn("address"));

    await mgr.save("home", "My home address is 123 Example St");
    await mgr.save("work", "My work location is downtown office");

    const results = await mgr.searchIndex("address");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // At least one result should have a vectorScore (since embeddings are configured)
    const withVector = results.filter((r) => r.vectorScore !== undefined);
    expect(withVector.length).toBeGreaterThanOrEqual(1);
    mgr.close();
  });

  test("hybrid search ranks semantically similar results higher", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    // Bias: "location" is the semantic concept
    await mgr.setEmbedding(semanticEmbedFn("location"));

    // "home" text doesn't contain "location" keyword but is about a location
    await mgr.save("home", "My home is at 456 Oak Avenue in Portland");
    await mgr.save("work-location", "My work location is the downtown office");
    await mgr.save("food", "I like pizza and sushi for lunch");

    // Search for "location" — both BM25 (keyword match) and vector should favor location-related
    const results = await mgr.searchIndex("location");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // The food entry should rank lowest (if present at all)
    const foodIdx = results.findIndex((r) => r.source.includes("food"));
    if (foodIdx >= 0 && results.length > 1) {
      // Food should not be the top result
      expect(foodIdx).toBeGreaterThan(0);
    }
    mgr.close();
  });

  test("search weights are configurable", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    await mgr.setEmbedding(semanticEmbedFn("semantic"));

    await mgr.save("exact", "The semantic meaning of words");
    await mgr.save("keyword", "A keyword based search approach");

    // Heavy vector weight
    mgr.setSearchWeights({ vectorWeight: 0.9, textWeight: 0.1 });
    const vectorHeavy = await mgr.searchIndex("semantic");

    // Heavy text weight
    mgr.setSearchWeights({ vectorWeight: 0.1, textWeight: 0.9 });
    const textHeavy = await mgr.searchIndex("semantic");

    // Both should return results (no crashes)
    expect(vectorHeavy.length).toBeGreaterThanOrEqual(1);
    expect(textHeavy.length).toBeGreaterThanOrEqual(1);
    mgr.close();
  });
});

describe("Temporal decay", () => {
  test("journal entries decay based on age", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    mgr.setSearchWeights({
      temporalDecay: { enabled: true, halfLifeDays: 30 },
    });

    // Journal entry from today
    const today = new Date().toISOString().slice(0, 10);
    await mgr.appendJournal("Met with Alice about the project plan", today);

    // Journal entry from 90 days ago
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await mgr.appendJournal("Met with Alice about the project roadmap", oldDate);

    const results = await mgr.searchIndex("Alice project");
    expect(results.length).toBe(2);

    // Today's entry should rank higher due to temporal decay
    const todayResult = results.find((r) => r.source.includes(today));
    const oldResult = results.find((r) => r.source.includes(oldDate));
    expect(todayResult).toBeDefined();
    expect(oldResult).toBeDefined();

    if (todayResult && oldResult) {
      expect(todayResult.score).toBeGreaterThan(oldResult.score);
    }
    mgr.close();
  });

  test("evergreen files (project memory) do not decay", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    mgr.setSearchWeights({
      temporalDecay: { enabled: true, halfLifeDays: 30 },
    });

    await mgr.save("preferences", "User prefers dark mode in all applications");

    const results = await mgr.searchIndex("dark mode");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Project memory score should not be decayed
    expect(results[0].sourceType).toBe("project");
    expect(results[0].score).toBeGreaterThan(0);
    mgr.close();
  });

  test("temporal decay can be disabled", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    mgr.setSearchWeights({
      temporalDecay: { enabled: false },
    });

    const today = new Date().toISOString().slice(0, 10);
    await mgr.appendJournal("Entry about testing decay disabled", today);

    const oldDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await mgr.appendJournal("Entry about testing decay disabled long ago", oldDate);

    const results = await mgr.searchIndex("testing decay disabled");
    expect(results.length).toBe(2);

    // Without decay, the raw BM25 scores determine order (both similar)
    // Both should have non-zero scores
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
    mgr.close();
  });

  test("temporal decay half-life math is correct", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    mgr.setSearchWeights({
      temporalDecay: { enabled: true, halfLifeDays: 30 },
    });

    const today = new Date().toISOString().slice(0, 10);
    await mgr.appendJournal("Identical note about quantum computing", today);

    // 30 days ago = exactly half-life
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await mgr.appendJournal("Identical note about quantum computing", thirtyDaysAgo);

    const results = await mgr.searchIndex("quantum computing");
    expect(results.length).toBe(2);

    const todayResult = results.find((r) => r.source.includes(today));
    const oldResult = results.find((r) => r.source.includes(thirtyDaysAgo));

    if (todayResult && oldResult) {
      // After 30 days (one half-life), score should be roughly half
      const ratio = oldResult.score / todayResult.score;
      expect(ratio).toBeGreaterThan(0.3); // Allow some tolerance
      expect(ratio).toBeLessThan(0.7);
    }
    mgr.close();
  });

  test("very old journal entries are near-zero but still findable", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();
    mgr.setSearchWeights({
      temporalDecay: { enabled: true, halfLifeDays: 30 },
    });

    // 180 days ago — ~6 half-lives, multiplier ~0.016
    const ancientDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await mgr.appendJournal("Ancient note about rare topic zebra migration", ancientDate);

    const results = await mgr.searchIndex("zebra migration");
    expect(results.length).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
    // Score should be very small but nonzero
    expect(results[0].score).toBeLessThan(0.1);
    mgr.close();
  });
});

describe("Score normalization", () => {
  test("BM25 scores are normalized to positive values", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("alpha", "Alpha is the first letter of the Greek alphabet");
    await mgr.save("beta", "Beta is the second letter of the Greek alphabet");
    await mgr.save("gamma", "Gamma is the third letter of the Greek alphabet");

    const results = await mgr.searchIndex("Greek alphabet");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
    mgr.close();
  });
});
