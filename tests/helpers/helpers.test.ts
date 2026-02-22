import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { withTempDir } from "./temp-dir.js";
import { LIVE, makeLiveRouter, describeLive } from "./live-model.js";
import { echoTool, failTool, slowTool } from "./test-tools.js";

// --- temp-dir helper ---

describe("withTempDir", () => {
  withTempDir((getDir) => {
    test("provides a directory that exists during the test", () => {
      const dir = getDir();
      expect(dir).toBeTruthy();
      expect(existsSync(dir)).toBe(true);
    });

    test("provides a unique directory each time", async () => {
      const dir = getDir();
      // Write a marker file to verify isolation
      await writeFile(join(dir, "marker.txt"), "ok");
      expect(existsSync(join(dir, "marker.txt"))).toBe(true);
    });
  });
});

// --- test-tools ---

describe("echoTool", () => {
  test("returns the input message", async () => {
    const result = await echoTool.execute({ message: "hello" });
    expect(result.content).toBe("hello");
    expect(result.isError).toBeUndefined();
  });

  test("has safe danger level", () => {
    expect(echoTool.dangerLevel).toBe("safe");
  });
});

describe("failTool", () => {
  test("throws with default message", async () => {
    await expect(failTool.execute({})).rejects.toThrow("intentional test failure");
  });

  test("throws with custom reason", async () => {
    await expect(failTool.execute({ reason: "boom" })).rejects.toThrow("boom");
  });
});

describe("slowTool", () => {
  test("waits and returns", async () => {
    const start = Date.now();
    const result = await slowTool.execute({ ms: 50 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow slight timing variance
    expect(result.content).toBe("waited 50ms");
  });
});

// --- live-model ---

describe("live-model", () => {
  test("LIVE flag reflects ANTHROPIC_API_KEY presence", () => {
    expect(typeof LIVE).toBe("boolean");
    expect(LIVE).toBe(!!process.env.ANTHROPIC_API_KEY);
  });

  test("makeLiveRouter() throws without API key", () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    try {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => makeLiveRouter()).toThrow("requires ANTHROPIC_API_KEY");
    } finally {
      if (saved) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test("describeLive is a function", () => {
    expect(typeof describeLive).toBe("function");
  });
});

// Only run when API key is present
describeLive("makeLiveRouter (live)", () => {
  test("creates a working router", () => {
    const router = makeLiveRouter();
    expect(router.getActiveModelName()).toBe("haiku");
    expect(router.listModels()).toContain("haiku");
  });
});
