import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryManager } from "@aria/engine/memory/index.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "aria-test-memory-integration-" + Date.now());

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("getMemoryContext", () => {
  test("returns relevant snippets for a query", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("user-name", "The user's name is Alice.");
    await mgr.save("user-city", "Alice lives in Portland, Oregon.");

    const context = await mgr.getMemoryContext("Alice");
    expect(context).toContain("Alice");
    expect(context).toContain("project/");
    mgr.close();
  });

  test("returns empty string when no matches", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("unrelated", "Weather forecast for tomorrow");

    const context = await mgr.getMemoryContext("quantum physics");
    // No matches, and no journal for today → empty
    expect(context).toBe("");
    mgr.close();
  });

  test("includes today's journal when it exists", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    const today = new Date().toISOString().slice(0, 10);
    await mgr.appendJournal("Discussed the project timeline with team", today);

    const context = await mgr.getMemoryContext("unrelated query xyz");
    expect(context).toContain("Today's journal");
    expect(context).toContain("Discussed the project timeline");
    mgr.close();
  });

  test("returns both search results and journal", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("preferences", "User prefers dark mode and TypeScript");
    const today = new Date().toISOString().slice(0, 10);
    await mgr.appendJournal("Worked on TypeScript project today", today);

    const context = await mgr.getMemoryContext("TypeScript");
    expect(context).toContain("project/preferences.md");
    expect(context).toContain("Today's journal");
    mgr.close();
  });

  test("surfaces profile and operational layers distinctly", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.saveLayer("profile", "tone", "Operator prefers direct language in trusted sessions.");
    await mgr.saveLayer("operational", "session-mode", "Current session is running in trusted mode.");

    const context = await mgr.getMemoryContext("trusted");
    expect(context).toContain("Profile memory");
    expect(context).toContain("Operational memory");
    mgr.close();
  });

  test("handles empty query gracefully", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    await mgr.save("data", "Some data");

    // Empty query → no search results, but today's journal might be included
    const context = await mgr.getMemoryContext("");
    // Should not throw
    expect(typeof context).toBe("string");
    mgr.close();
  });

  test("truncates long journal entries", async () => {
    const mgr = new MemoryManager(testDir);
    await mgr.init();

    const longContent = "A".repeat(1000);
    const today = new Date().toISOString().slice(0, 10);
    await mgr.appendJournal(longContent, today);

    const context = await mgr.getMemoryContext("anything");
    expect(context).toContain("...");
    // Should be truncated to around 500 chars + header
    expect(context.length).toBeLessThan(700);
    mgr.close();
  });
});
