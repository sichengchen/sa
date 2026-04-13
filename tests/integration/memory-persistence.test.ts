import { describe, test, expect, afterEach } from "bun:test";
import { MemoryManager } from "@aria/memory";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "aria-integration-memory-" + Date.now());

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Memory persistence integration", () => {
  test("memories survive manager restart", async () => {
    // First session: save memories
    const mgr1 = new MemoryManager(testDir);
    await mgr1.init();
    await mgr1.save("user-name", "The user's name is Alice.");
    await mgr1.save("preferences", "Prefers dark mode and TypeScript.");

    // Second session: new manager instance, same directory
    const mgr2 = new MemoryManager(testDir);
    await mgr2.init();

    // Verify memories persist
    const name = await mgr2.get("user-name");
    expect(name).toBe("The user's name is Alice.");

    const prefs = await mgr2.get("preferences");
    expect(prefs).toBe("Prefers dark mode and TypeScript.");

    // Search works across sessions
    const results = await mgr2.search("alice");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("user-name");

    // List works
    const keys = await mgr2.list();
    expect(keys).toContain("user-name");
    expect(keys).toContain("preferences");
  });

  test("deleted memories don't reappear", async () => {
    const mgr1 = new MemoryManager(testDir);
    await mgr1.init();
    await mgr1.save("temp", "temporary data");
    await mgr1.delete("temp");

    // New session
    const mgr2 = new MemoryManager(testDir);
    await mgr2.init();
    expect(await mgr2.get("temp")).toBeNull();
    expect(await mgr2.list()).not.toContain("temp");
  });
});
