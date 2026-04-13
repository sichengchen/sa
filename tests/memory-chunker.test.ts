import { describe, test, expect } from "bun:test";
import { chunkMarkdown } from "@aria/memory/chunker";

describe("chunkMarkdown", () => {
  test("returns empty array for empty content", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   ")).toEqual([]);
    expect(chunkMarkdown("\n\n")).toEqual([]);
  });

  test("returns single chunk for small content", () => {
    const content = "Hello world.\n\nThis is a short note.";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(3);
  });

  test("splits large content into multiple chunks", () => {
    // Create content with many paragraphs, each ~200 chars
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i + 1}. ${"x".repeat(150)}`,
    );
    const content = paragraphs.join("\n\n");
    const chunks = chunkMarkdown(content, 400, 100);

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should contain text
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.lineStart).toBeGreaterThanOrEqual(1);
      expect(chunk.lineEnd).toBeGreaterThanOrEqual(chunk.lineStart);
    }
  });

  test("tracks line numbers correctly", () => {
    const content = "Line one.\n\nLine three.\n\nLine five.";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1); // small content = single chunk
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(5);
  });

  test("handles single paragraph", () => {
    const content = "Just one paragraph with no breaks.";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(1);
  });

  test("chunks have overlap", () => {
    // Create enough content to need splitting
    const paragraphs = Array.from(
      { length: 15 },
      (_, i) => `Section ${i + 1}: ${"data ".repeat(60)}`,
    );
    const content = paragraphs.join("\n\n");
    const chunks = chunkMarkdown(content, 800, 200);

    if (chunks.length >= 2) {
      // The end of chunk N should overlap with the beginning of chunk N+1
      const first = chunks[0].content;
      const second = chunks[1].content;
      // Find text from end of first chunk that appears at start of second
      const lastPara = first.split("\n\n").pop()!;
      expect(second).toContain(lastPara);
    }
  });

  test("handles content with leading/trailing blank lines", () => {
    const content = "\n\nHello world.\n\nGoodbye.\n\n";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Hello world.");
    expect(chunks[0].content).toContain("Goodbye.");
  });

  test("respects custom target and overlap sizes", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: ${"y".repeat(100)}`);
    const content = paragraphs.join("\n\n");

    const smallChunks = chunkMarkdown(content, 200, 50);
    const largeChunks = chunkMarkdown(content, 2000, 100);

    // Smaller target → more chunks
    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
  });

  test("handles multiline paragraphs", () => {
    const content = "Line A\nLine B\nLine C\n\nLine D\nLine E";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Line A\nLine B\nLine C");
    expect(chunks[0].content).toContain("Line D\nLine E");
  });
});
