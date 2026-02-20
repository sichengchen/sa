import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager, DEFAULT_CONFIG } from "../src/engine/config/index.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const testHome = join(tmpdir(), "sa-test-config-" + Date.now());

beforeEach(async () => {
  await mkdir(testHome, { recursive: true });
});

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

describe("ConfigManager", () => {
  describe("load", () => {
    test("creates default files when SA_HOME is empty", async () => {
      const emptyDir = join(testHome, "empty");
      const mgr = new ConfigManager(emptyDir);
      const config = await mgr.load();

      expect(config.identity.name).toBe("SA (Sasa)");
      expect(config.identity.personality).toContain("helpful");
      expect(config.identity.systemPrompt).toContain("personal AI agent");
      expect(config.runtime.activeModel).toBe("sonnet");
      expect(existsSync(join(emptyDir, "IDENTITY.md"))).toBe(true);
      expect(existsSync(join(emptyDir, "config.json"))).toBe(true);
      expect(existsSync(join(emptyDir, "models.json"))).toBe(true);
    });

    test("loads existing IDENTITY.md", async () => {
      await writeFile(
        join(testHome, "IDENTITY.md"),
        `# MyBot\n\n## Personality\nSnarky and witty.\n\n## System Prompt\nYou are MyBot.\n`
      );
      const mgr = new ConfigManager(testHome);
      const config = await mgr.load();

      expect(config.identity.name).toBe("MyBot");
      expect(config.identity.personality).toBe("Snarky and witty.");
      expect(config.identity.systemPrompt).toBe("You are MyBot.");
    });

    test("loads existing config.json", async () => {
      const custom = {
        activeModel: "gpt4o",
        telegramBotTokenEnvVar: "MY_TG_TOKEN",
        memory: { enabled: false, directory: "mem" },
      };
      await writeFile(join(testHome, "config.json"), JSON.stringify(custom));
      const mgr = new ConfigManager(testHome);
      const config = await mgr.load();

      expect(config.runtime.activeModel).toBe("gpt4o");
      expect(config.runtime.memory.enabled).toBe(false);
    });
  });

  describe("getIdentity / getConfig before load", () => {
    test("throws if load() not called", () => {
      const mgr = new ConfigManager(testHome);
      expect(() => mgr.getIdentity()).toThrow("not loaded");
      expect(() => mgr.getConfig()).toThrow("not loaded");
    });
  });

  describe("setConfig", () => {
    test("updates config value and persists to file", async () => {
      const mgr = new ConfigManager(testHome);
      await mgr.load();

      await mgr.setConfig("activeModel", "gpt4o");
      expect(mgr.getConfig().activeModel).toBe("gpt4o");

      // Reload from disk to verify persistence
      const mgr2 = new ConfigManager(testHome);
      const config2 = await mgr2.load();
      expect(config2.runtime.activeModel).toBe("gpt4o");
    });
  });

  describe("getModelsPath", () => {
    test("returns path within home dir", () => {
      const mgr = new ConfigManager(testHome);
      expect(mgr.getModelsPath()).toBe(join(testHome, "models.json"));
    });
  });
});
