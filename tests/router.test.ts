import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ModelRouter } from "../src/router/index.js";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const fixtureDir = join(tmpdir(), "sa-test-router");
const configPath = join(fixtureDir, "models.json");

const validConfig = {
  default: "sonnet",
  models: [
    {
      name: "sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      temperature: 0.7,
      maxTokens: 4096,
    },
    {
      name: "gpt4o",
      provider: "openai",
      model: "gpt-4o",
      apiKeyEnvVar: "OPENAI_API_KEY",
      temperature: 0.5,
    },
  ],
};

async function writeConfig(config: unknown) {
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config));
}

afterEach(async () => {
  try {
    await unlink(configPath);
  } catch {}
});

describe("ModelRouter", () => {
  describe("loading", () => {
    test("loads valid config", async () => {
      await writeConfig(validConfig);
      const router = await ModelRouter.load(configPath);
      expect(router.listModels()).toEqual(["sonnet", "gpt4o"]);
      expect(router.getActiveModelName()).toBe("sonnet");
    });

    test("rejects empty models array", async () => {
      await writeConfig({ default: "x", models: [] });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "at least one model"
      );
    });

    test("rejects missing default", async () => {
      await writeConfig({
        default: "",
        models: [{ name: "a", provider: "openai", model: "gpt-4o", apiKeyEnvVar: "X" }],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "must specify a default"
      );
    });

    test("rejects default not in models list", async () => {
      await writeConfig({
        default: "missing",
        models: [{ name: "a", provider: "openai", model: "gpt-4o", apiKeyEnvVar: "X" }],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        'not found in models list'
      );
    });

    test("rejects duplicate model names", async () => {
      await writeConfig({
        default: "a",
        models: [
          { name: "a", provider: "openai", model: "gpt-4o", apiKeyEnvVar: "X" },
          { name: "a", provider: "anthropic", model: "claude-sonnet-4-5-20250514", apiKeyEnvVar: "Y" },
        ],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow("Duplicate");
    });
  });

  describe("switching", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("switches to a valid model", () => {
      router.switchModel("gpt4o");
      expect(router.getActiveModelName()).toBe("gpt4o");
    });

    test("throws on unknown model", () => {
      expect(() => router.switchModel("nonexistent")).toThrow('not found');
    });
  });

  describe("getConfig", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("returns active model config", () => {
      const cfg = router.getConfig();
      expect(cfg.name).toBe("sonnet");
      expect(cfg.provider).toBe("anthropic");
    });

    test("returns named model config", () => {
      const cfg = router.getConfig("gpt4o");
      expect(cfg.name).toBe("gpt4o");
      expect(cfg.provider).toBe("openai");
    });

    test("throws on unknown name", () => {
      expect(() => router.getConfig("nope")).toThrow('not found');
    });
  });

  describe("CRUD", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("adds a new model", async () => {
      await router.addModel({
        name: "gemini",
        provider: "google",
        model: "gemini-2.0-flash",
        apiKeyEnvVar: "GOOGLE_AI_API_KEY",
      });
      expect(router.listModels()).toContain("gemini");
    });

    test("rejects adding duplicate name", async () => {
      await expect(
        router.addModel({
          name: "sonnet",
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250514",
          apiKeyEnvVar: "ANTHROPIC_API_KEY",
        })
      ).rejects.toThrow("already exists");
    });

    test("removes a model", async () => {
      await router.removeModel("gpt4o");
      expect(router.listModels()).not.toContain("gpt4o");
    });

    test("cannot remove default model", async () => {
      await expect(router.removeModel("sonnet")).rejects.toThrow(
        "Cannot remove the default"
      );
    });

    test("resets active to default when active model is removed", async () => {
      router.switchModel("gpt4o");
      await router.removeModel("gpt4o");
      expect(router.getActiveModelName()).toBe("sonnet");
    });
  });

  describe("getStreamOptions", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("throws when API key env var is not set", () => {
      const original = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        expect(() => router.getStreamOptions()).toThrow("not set");
      } finally {
        if (original) process.env.ANTHROPIC_API_KEY = original;
      }
    });

    test("returns options when API key is available", () => {
      const original = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "test-key";
      try {
        const opts = router.getStreamOptions();
        expect(opts.apiKey).toBe("test-key");
        expect(opts.temperature).toBe(0.7);
        expect(opts.maxTokens).toBe(4096);
      } finally {
        if (original) {
          process.env.ANTHROPIC_API_KEY = original;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    });
  });
});
