import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryManager } from "../../src/engine/memory/manager.js";
import { createMemoryWriteTool } from "../../src/engine/tools/memory-write.js";
import { createMemorySearchTool } from "../../src/engine/tools/memory-search.js";
import { createMemoryReadTool } from "../../src/engine/tools/memory-read.js";
import { createMemoryDeleteTool } from "../../src/engine/tools/memory-delete.js";

let tmpDir: string;
let memory: MemoryManager;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sa-memory-tools-test-"));
  memory = new MemoryManager(tmpDir);
  await memory.init();
});

afterEach(async () => {
  memory.close();
  await rm(tmpDir, { recursive: true, force: true });
});

describe("memory_write tool", () => {
  it("saves topic with key", async () => {
    const tool = createMemoryWriteTool(memory);
    const result = await tool.execute({ key: "greeting", content: "Hello world" });
    expect(result.content).toBe("Saved memory: greeting");

    const content = await memory.get("greeting");
    expect(content).toBe("Hello world");
  });

  it("appends to journal without key", async () => {
    const tool = createMemoryWriteTool(memory);
    const result = await tool.execute({ content: "Had a productive meeting" });
    expect(result.content).toContain("Appended to journal:");

    const today = new Date().toISOString().slice(0, 10);
    const journal = await memory.getJournal(today);
    expect(journal).toContain("Had a productive meeting");
  });

  it("appends to journal with explicit type", async () => {
    const tool = createMemoryWriteTool(memory);
    const result = await tool.execute({ content: "Session notes", type: "journal" });
    expect(result.content).toContain("Appended to journal:");
  });

  it("saves topic when key and type: topic provided", async () => {
    const tool = createMemoryWriteTool(memory);
    const result = await tool.execute({ key: "prefs", content: "Dark mode", type: "topic" });
    expect(result.content).toBe("Saved memory: prefs");
  });
});

describe("memory_search tool", () => {
  it("returns no-match message when nothing found", async () => {
    const tool = createMemorySearchTool(memory);
    const result = await tool.execute({ query: "xyz" });
    expect(result.content).toBe("No relevant memories found.");
  });

  it("returns matching entries with source attribution", async () => {
    await memory.save("project", "Esperta Base is a personal AI assistant");
    await memory.save("unrelated", "weather forecast today");
    const tool = createMemorySearchTool(memory);
    const result = await tool.execute({ query: "personal AI" });
    expect(result.content).toContain("project/project.md");
    expect(result.content).toContain("Esperta Base is a personal AI assistant");
    expect(result.content).toContain("score:");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await memory.save(`note-${i}`, `Important note number ${i} about testing`);
    }
    const tool = createMemorySearchTool(memory);
    const result = await tool.execute({ query: "note", limit: 2 });
    // Count source attributions (each result has a [source] line)
    const matches = result.content!.match(/\[project\//g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  it("filters by source type", async () => {
    await memory.save("topic-note", "Meeting notes about project");
    await memory.appendJournal("Had a meeting about project X");
    const tool = createMemorySearchTool(memory);

    const topicResult = await tool.execute({ query: "meeting", source: "topics" });
    expect(topicResult.content).toContain("project/");
    expect(topicResult.content).not.toContain("journal/");
  });

  it("filters by explicit layered sources", async () => {
    await memory.saveLayer("profile", "tone", "Use direct language");
    await memory.saveLayer("operational", "mode", "Trusted mode for this session");
    const tool = createMemorySearchTool(memory);

    const profileResult = await tool.execute({ query: "direct", source: "profile" });
    expect(profileResult.content).toContain("profile/tone.md");

    const operationalResult = await tool.execute({ query: "trusted", source: "operational" });
    expect(operationalResult.content).toContain("operational/mode.md");
  });
});

describe("memory_read tool", () => {
  it("reads topic by key", async () => {
    await memory.save("greeting", "Hello world");
    const tool = createMemoryReadTool(memory);
    const result = await tool.execute({ key: "greeting" });
    expect(result.content).toBe("Hello world");
  });

  it("reads journal by date", async () => {
    await memory.appendJournal("Today's entry", "2026-02-22");
    const tool = createMemoryReadTool(memory);
    const result = await tool.execute({ key: "2026-02-22" });
    expect(result.content).toContain("Today's entry");
  });

  it("returns not-found for missing topic", async () => {
    const tool = createMemoryReadTool(memory);
    const result = await tool.execute({ key: "nonexistent" });
    expect(result.content).toBe("No memory found for key: nonexistent");
  });

  it("reads profile memory when layer is provided", async () => {
    await memory.saveLayer("profile", "style", "Brief responses");
    const tool = createMemoryReadTool(memory);
    const result = await tool.execute({ key: "style", layer: "profile" });
    expect(result.content).toBe("Brief responses");
  });

  it("returns not-found for missing journal date", async () => {
    const tool = createMemoryReadTool(memory);
    const result = await tool.execute({ key: "2020-01-01" });
    expect(result.content).toBe("No journal entry for: 2020-01-01");
  });
});

describe("memory_delete tool", () => {
  it("deletes existing topic", async () => {
    await memory.save("temp", "temporary data");
    const tool = createMemoryDeleteTool(memory);
    const result = await tool.execute({ key: "temp" });
    expect(result.content).toBe("Deleted memory: temp");

    const got = await memory.get("temp");
    expect(got).toBeNull();
  });

  it("returns not-found for missing key", async () => {
    const tool = createMemoryDeleteTool(memory);
    const result = await tool.execute({ key: "ghost" });
    expect(result.content).toBe("No memory found for key: ghost");
  });

  it("deletes profile memory when layer is provided", async () => {
    await memory.saveLayer("profile", "style", "Brief responses");
    const tool = createMemoryDeleteTool(memory);
    const result = await tool.execute({ key: "style", layer: "profile" });
    expect(result.content).toBe("Deleted profile memory: style");
    expect(await memory.getLayer("profile", "style")).toBeNull();
  });
});
