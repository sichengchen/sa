import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { withTempDir } from "./temp-dir.js";
import { LIVE, describeLive, makeLiveRouter, resolveLiveProviderSelection } from "./live-model.js";
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
  test("LIVE flag reflects supported live provider presence", () => {
    expect(typeof LIVE).toBe("boolean");
    expect(LIVE).toBe(resolveLiveProviderSelection() !== null);
  });

  test("makeLiveRouter() throws without API key", () => {
    const saved = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
      ARIA_LIVE_PROVIDER: process.env.ARIA_LIVE_PROVIDER,
    };
    try {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      delete process.env.MINIMAX_API_KEY;
      delete process.env.ARIA_LIVE_PROVIDER;
      expect(() => makeLiveRouter()).toThrow("requires one of ANTHROPIC_API_KEY");
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
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
    const selection = resolveLiveProviderSelection();
    expect(selection).not.toBeNull();
    expect(router.getActiveModelName()).toBe(selection!.modelName);
    expect(router.listModels()).toContain(selection!.modelName);
  });
});
