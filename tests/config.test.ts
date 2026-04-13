import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager } from "@aria/server/config";
import { writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const testHome = join(tmpdir(), "aria-test-config-" + Date.now());

beforeEach(async () => {
  await mkdir(testHome, { recursive: true });
});

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

describe("ConfigManager", () => {
  describe("load", () => {
    test("creates default config.json (v3) in a fresh Aria runtime home", async () => {
      const emptyDir = join(testHome, "empty");
      const mgr = new ConfigManager(emptyDir);
      const config = await mgr.load();

      expect(config.identity.name).toBe("Esperta Aria");
      expect(config.identity.personality).toContain("helpful");
      expect(config.identity.systemPrompt).toContain("local-first agent platform runtime");
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
        `# MyBot\n\n## Personality\nSnarky and witty.\n\n## System Prompt\nYou are MyBot.\n`,
      );
      const mgr = new ConfigManager(testHome);
      const config = await mgr.load();

      expect(config.identity.name).toBe("MyBot");
      expect(config.identity.personality).toBe("Snarky and witty.");
      expect(config.identity.systemPrompt).toBe("You are MyBot.");
    });

    test("rejects legacy config formats instead of migrating them", async () => {
      const legacyConfig = {
        activeModel: "gpt4o",
        telegramBotTokenEnvVar: "MY_TG_TOKEN",
        memory: { enabled: false, directory: "mem" },
      };
      await writeFile(join(testHome, "config.json"), JSON.stringify(legacyConfig));

      const mgr = new ConfigManager(testHome);
      await expect(mgr.load()).rejects.toThrow("only supports config.json version 3");
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
      configFile.models.push({
        name: "new-default",
        provider: "anthropic",
        model: "m",
      });
      await mgr.saveConfig(configFile);

      // Reload and verify
      const mgr2 = new ConfigManager(testHome);
      const config2 = await mgr2.load();
      expect(config2.defaultModel).toBe("new-default");
      expect(config2.models).toHaveLength(2);
    });
  });
});
