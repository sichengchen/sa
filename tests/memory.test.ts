import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryManager } from "@sa/engine/memory/index.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const testDir = join(tmpdir(), "sa-test-memory-" + Date.now());

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("MemoryManager", () => {
  test("init creates directories, MEMORY.md, and SQLite index", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    const context = await mgr.loadContext();
    expect(context).toBe("");
    expect(existsSync(join(testDir, "profile"))).toBe(true);
    expect(existsSync(join(testDir, "project"))).toBe(true);
    expect(existsSync(join(testDir, "operational"))).toBe(true);
    expect(existsSync(join(testDir, "journal"))).toBe(true);
    expect(existsSync(join(testDir, ".index.sqlite"))).toBe(true);
    mgr.close();
  });

  test("save and get memory entries", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("user-prefs", "Likes dark mode.");
    const content = await mgr.get("user-prefs");
    expect(content).toBe("Likes dark mode.");
    mgr.close();
  });

  test("list returns saved keys", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("prefs", "dark mode");
    await mgr.save("context", "project X");

    const keys = await mgr.list();
    expect(keys).toContain("prefs");
    expect(keys).toContain("context");
    mgr.close();
  });

  test("delete removes entry", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("temp", "temporary");
    expect(await mgr.delete("temp")).toBe(true);
    expect(await mgr.get("temp")).toBeNull();
    mgr.close();
  });

  test("delete returns false for missing key", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    expect(await mgr.delete("nonexistent")).toBe(false);
    mgr.close();
  });

  test("search finds matching entries via FTS5", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("cats", "I love cats and kittens.");
    await mgr.save("dogs", "Dogs are great companions.");

    const results = await mgr.search("cats");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("cats");
    mgr.close();
  });

  test("search is case-insensitive", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("info", "TypeScript is great.");

    const results = await mgr.search("typescript");
    expect(results).toHaveLength(1);
    mgr.close();
  });

  test("loadContext reads MEMORY.md", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await writeFile(join(testDir, "MEMORY.md"), "Key insight: test works.");
    const context = await mgr.loadContext();
    expect(context).toBe("Key insight: test works.");
    mgr.close();
  });

  test("loadContext truncates long MEMORY.md", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
    await writeFile(join(testDir, "MEMORY.md"), lines.join("\n"));

    const context = await mgr.loadContext();
    expect(context).toContain("line 1");
    expect(context).toContain("line 200");
    expect(context).toContain("...(truncated)");
    expect(context).not.toContain("line 201");
    mgr.close();
  });

  test("sanitizes keys to safe filenames", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("my/unsafe key!", "content");
    const content = await mgr.get("my/unsafe key!");
    expect(content).toBe("content");
    mgr.close();
  });
});

describe("MemoryManager — FTS5 search", () => {
  test("searchIndex returns ranked SearchResult[]", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("address", "My address is 123 Example St, Columbus OH");
    await mgr.save("phone", "My phone number is 555-1234");

    const results = await mgr.searchIndex("address");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sourceType).toBe("project");
    expect(results[0].source).toBe("project/address.md");
    expect(results[0].content).toContain("123 Example St");
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].lineStart).toBeGreaterThanOrEqual(1);
    mgr.close();
  });

  test("searchIndex filters by source type", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("note", "Meeting notes for today");
    await mgr.appendJournal("Had a meeting about project X");

    const topicOnly = await mgr.searchIndex("meeting", { sourceType: "project" });
    const journalOnly = await mgr.searchIndex("meeting", { sourceType: "journal" });

    expect(topicOnly.every((r) => r.sourceType === "project")).toBe(true);
    expect(journalOnly.every((r) => r.sourceType === "journal")).toBe(true);
    mgr.close();
  });

  test("searchIndex respects maxResults", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    for (let i = 0; i < 5; i++) {
      await mgr.save(`note-${i}`, `Important note number ${i} about testing`);
    }

    const limited = await mgr.searchIndex("note", { maxResults: 2 });
    expect(limited.length).toBeLessThanOrEqual(2);
    mgr.close();
  });

  test("searchIndex returns empty for no matches", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("item", "Hello world");
    const results = await mgr.searchIndex("zzzzzznonexistent");
    expect(results).toEqual([]);
    mgr.close();
  });

  test("search also indexes MEMORY.md", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await writeFile(join(testDir, "MEMORY.md"), "The user prefers dark mode in all applications.");
    await mgr.reindex();

    const results = await mgr.searchIndex("dark mode");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sourceType).toBe("memory");
    mgr.close();
  });

  test("deleted entries are removed from index", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("removeme", "This content will be deleted.");
    let results = await mgr.searchIndex("deleted");
    expect(results.length).toBeGreaterThanOrEqual(1);

    await mgr.delete("removeme");
    results = await mgr.searchIndex("deleted");
    expect(results).toEqual([]);
    mgr.close();
  });
});

describe("MemoryManager — Journal", () => {
  test("appendJournal creates and appends to daily file", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.appendJournal("First entry.", "2026-02-22");
    let content = await mgr.getJournal("2026-02-22");
    expect(content).toBe("First entry.");

    await mgr.appendJournal("Second entry.", "2026-02-22");
    content = await mgr.getJournal("2026-02-22");
    expect(content).toBe("First entry.\n\nSecond entry.");
    mgr.close();
  });

  test("getJournal returns null for missing date", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    expect(await mgr.getJournal("2020-01-01")).toBeNull();
    mgr.close();
  });

  test("journal entries are searchable", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.appendJournal("Discussed the new database migration plan.", "2026-02-22");
    const results = await mgr.searchIndex("database migration");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sourceType).toBe("journal");
    mgr.close();
  });
});

describe("MemoryManager — Reindex and migration", () => {
  test("reindex picks up externally created topic files", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    // Create a topic file externally (simulating migration)
    await writeFile(join(testDir, "topics", "external.md"), "Externally created memory file.");
    await mgr.reindex();

    const results = await mgr.searchIndex("externally created");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].source).toBe("project/external.md");
    mgr.close();
  });

  test("reindex removes entries for deleted files", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("willdelete", "This unique content will be gone soon.");
    // Verify it's indexed
    expect((await mgr.searchIndex("unique content")).length).toBeGreaterThanOrEqual(1);

    // Delete file externally
    const { unlink } = await import("node:fs/promises");
    await unlink(join(testDir, "project", "willdelete.md"));
    await mgr.reindex();

    expect(await mgr.searchIndex("unique content")).toEqual([]);
    mgr.close();
  });

  test("memories survive manager restart with reindex", async () => {
    const mgr1 = new MemoryManager(testDir);
    await mgr1.init();
    await mgr1.save("user-name", "The user's name is Alice.");
    await mgr1.save("preferences", "Prefers dark mode and TypeScript.");
    mgr1.close();

    // New manager instance — reindex on init
    const mgr2 = new MemoryManager(testDir);
    await mgr2.init();

    const name = await mgr2.get("user-name");
    expect(name).toBe("The user's name is Alice.");

    const results = await mgr2.search("alice");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("user-name");

    const keys = await mgr2.list();
    expect(keys).toContain("user-name");
    expect(keys).toContain("preferences");
    mgr2.close();
  });

  test("supports explicit profile and operational layers", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.saveLayer("profile", "user-style", "Prefers terse answers.");
    await mgr.saveLayer("operational", "approval-mode", "Trusted mode enabled for repo maintenance.");

    expect(await mgr.getLayer("profile", "user-style")).toBe("Prefers terse answers.");
    expect(await mgr.getLayer("operational", "approval-mode")).toBe("Trusted mode enabled for repo maintenance.");

    const promptContext = await mgr.loadLayeredContext();
    expect(promptContext).toContain("## Profile Memory");
    expect(promptContext).toContain("Prefers terse answers.");
    expect(promptContext).toContain("## Operational Memory");
    expect(promptContext).toContain("Trusted mode enabled");
    mgr.close();
  });
});
