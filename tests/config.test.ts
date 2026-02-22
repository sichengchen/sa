import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager, DEFAULT_CONFIG } from "@sa/engine/config/index.js";
import { writeFile, rm, mkdir, readFile } from "node:fs/promises";
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
    test("creates default config.json (v3) when SA_HOME is empty", async () => {
      const emptyDir = join(testHome, "empty");
      const mgr = new ConfigManager(emptyDir);
      const config = await mgr.load();

      expect(config.identity.name).toBe("SA (Sasa)");
      expect(config.identity.personality).toContain("helpful");
      expect(config.identity.systemPrompt).toContain("personal AI agent");
      expect(config.runtime.activeModel).toBe("sonnet");
      expect(config.providers).toHaveLength(1);
      expect(config.providers[0].id).toBe("anthropic");
      expect(config.models).toHaveLength(1);
      expect(config.defaultModel).toBe("sonnet");
      expect(existsSync(join(emptyDir, "IDENTITY.md"))).toBe(true);
      expect(existsSync(join(emptyDir, "config.json"))).toBe(true);
      // No separate models.json in v3
      expect(existsSync(join(emptyDir, "models.json"))).toBe(false);
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

    test("auto-migrates legacy config.json + models.json to v3", async () => {
      // Write legacy config.json (no version)
      const legacyConfig = {
        activeModel: "gpt4o",
        telegramBotTokenEnvVar: "MY_TG_TOKEN",
        memory: { enabled: false, directory: "mem" },
      };
      await writeFile(join(testHome, "config.json"), JSON.stringify(legacyConfig));

      // Write legacy models.json (v2)
      const legacyModels = {
        version: 2,
        default: "fast",
        providers: [{ id: "openai", type: "openai", apiKeyEnvVar: "OPENAI_API_KEY" }],
        models: [{ name: "fast", provider: "openai", model: "gpt-4o" }],
      };
      await writeFile(join(testHome, "models.json"), JSON.stringify(legacyModels));

      const mgr = new ConfigManager(testHome);
      const config = await mgr.load();

      // Runtime preserved from old config.json
      expect(config.runtime.activeModel).toBe("gpt4o");
      expect(config.runtime.memory.enabled).toBe(false);
      // Providers/models migrated from old models.json
      expect(config.providers[0].id).toBe("openai");
      expect(config.models[0].name).toBe("fast");
      expect(config.defaultModel).toBe("fast");

      // Verify models.json was removed after migration
      expect(existsSync(join(testHome, "models.json"))).toBe(false);

      // Verify config.json was rewritten as v3
      const raw = JSON.parse(await readFile(join(testHome, "config.json"), "utf-8"));
      expect(raw.version).toBe(3);
    });

    test("loads v3 config.json directly", async () => {
      const v3Config = {
        version: 3,
        runtime: {
          activeModel: "custom",
          telegramBotTokenEnvVar: "TG",
          memory: { enabled: true, directory: "mem" },
        },
        providers: [{ id: "anthropic", type: "anthropic", apiKeyEnvVar: "KEY" }],
        models: [{ name: "custom", provider: "anthropic", model: "m" }],
        defaultModel: "custom",
      };
      await writeFile(join(testHome, "config.json"), JSON.stringify(v3Config));

      const mgr = new ConfigManager(testHome);
      const config = await mgr.load();

      expect(config.runtime.activeModel).toBe("custom");
      expect(config.defaultModel).toBe("custom");
      expect(config.models[0].name).toBe("custom");
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

  describe("saveConfig", () => {
    test("persists full config to disk", async () => {
      const mgr = new ConfigManager(testHome);
      await mgr.load();

      const configFile = mgr.getConfigFile();
      configFile.defaultModel = "new-default";
      configFile.models.push({ name: "new-default", provider: "anthropic", model: "m" });
      await mgr.saveConfig(configFile);

      // Reload and verify
      const mgr2 = new ConfigManager(testHome);
      const config2 = await mgr2.load();
      expect(config2.defaultModel).toBe("new-default");
      expect(config2.models).toHaveLength(2);
    });
  });
});
