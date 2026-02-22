import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryManager } from "@sa/engine/memory/index.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "sa-test-memory-" + Date.now());

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("MemoryManager", () => {
  test("init creates directories and MEMORY.md", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    const context = await mgr.loadContext();
    expect(context).toBe("");
  });

  test("save and get memory entries", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("user-prefs", "Likes dark mode.");
    const content = await mgr.get("user-prefs");
    expect(content).toBe("Likes dark mode.");
  });

  test("list returns saved keys", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("prefs", "dark mode");
    await mgr.save("context", "project X");

    const keys = await mgr.list();
    expect(keys).toContain("prefs");
    expect(keys).toContain("context");
  });

  test("delete removes entry", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("temp", "temporary");
    expect(await mgr.delete("temp")).toBe(true);
    expect(await mgr.get("temp")).toBeNull();
  });

  test("delete returns false for missing key", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    expect(await mgr.delete("nonexistent")).toBe(false);
  });

  test("search finds matching entries", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("cats", "I love cats and kittens.");
    await mgr.save("dogs", "Dogs are great companions.");

    const results = await mgr.search("cats");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("cats");
  });

  test("search is case-insensitive", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("info", "TypeScript is great.");

    const results = await mgr.search("typescript");
    expect(results).toHaveLength(1);
  });

  test("loadContext reads MEMORY.md", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await writeFile(join(testDir, "MEMORY.md"), "Key insight: test works.");
    const context = await mgr.loadContext();
    expect(context).toBe("Key insight: test works.");
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
  });

  test("sanitizes keys to safe filenames", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("my/unsafe key!", "content");
    const content = await mgr.get("my/unsafe key!");
    expect(content).toBe("content");
  });
});
