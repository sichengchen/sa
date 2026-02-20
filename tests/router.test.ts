import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ModelRouter } from "../src/engine/router/index.js";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const fixtureDir = join(tmpdir(), "sa-test-router");
const configPath = join(fixtureDir, "models.json");

const validConfig = {
  version: 2,
  default: "sonnet",
  providers: [
    {
      id: "anthropic",
      type: "anthropic",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
    {
      id: "openai",
      type: "openai",
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  ],
  models: [
    {
      name: "sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      temperature: 0.7,
      maxTokens: 4096,
    },
    {
      name: "gpt4o",
      provider: "openai",
      model: "gpt-4o",
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

    test("rejects missing version field", async () => {
      await writeConfig({ default: "x", providers: [{ id: "p", type: "anthropic", apiKeyEnvVar: "X" }], models: [{ name: "x", provider: "p", model: "m" }] });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "schema version unsupported"
      );
    });

    test("rejects wrong version", async () => {
      await writeConfig({ version: 1, default: "x", providers: [{ id: "p", type: "anthropic", apiKeyEnvVar: "X" }], models: [{ name: "x", provider: "p", model: "m" }] });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "schema version unsupported"
      );
    });

    test("rejects empty models array", async () => {
      await writeConfig({ version: 2, default: "x", providers: [{ id: "p", type: "anthropic", apiKeyEnvVar: "X" }], models: [] });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "at least one model"
      );
    });

    test("rejects empty providers array", async () => {
      await writeConfig({ version: 2, default: "x", providers: [], models: [{ name: "x", provider: "p", model: "m" }] });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "at least one provider"
      );
    });

    test("rejects missing default", async () => {
      await writeConfig({
        version: 2,
        default: "",
        providers: [{ id: "p", type: "anthropic", apiKeyEnvVar: "X" }],
        models: [{ name: "a", provider: "p", model: "gpt-4o" }],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        "must specify a default"
      );
    });

    test("rejects default not in models list", async () => {
      await writeConfig({
        version: 2,
        default: "missing",
        providers: [{ id: "p", type: "anthropic", apiKeyEnvVar: "X" }],
        models: [{ name: "a", provider: "p", model: "gpt-4o" }],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        'not found in models list'
      );
    });

    test("rejects duplicate model names", async () => {
      await writeConfig({
        version: 2,
        default: "a",
        providers: [{ id: "p", type: "anthropic", apiKeyEnvVar: "X" }],
        models: [
          { name: "a", provider: "p", model: "gpt-4o" },
          { name: "a", provider: "p", model: "claude-sonnet-4-5-20250514" },
        ],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow("Duplicate");
    });

    test("rejects model with unknown provider", async () => {
      await writeConfig({
        version: 2,
        default: "a",
        providers: [{ id: "p1", type: "anthropic", apiKeyEnvVar: "X" }],
        models: [{ name: "a", provider: "unknown-provider", model: "m" }],
      });
      await expect(ModelRouter.load(configPath)).rejects.toThrow(
        'unknown provider'
      );
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

  describe("getProvider", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("returns provider config by id", () => {
      const p = router.getProvider("anthropic");
      expect(p.id).toBe("anthropic");
      expect(p.type).toBe("anthropic");
      expect(p.apiKeyEnvVar).toBe("ANTHROPIC_API_KEY");
    });

    test("throws on unknown provider id", () => {
      expect(() => router.getProvider("nonexistent")).toThrow('not found');
    });
  });

  describe("CRUD — models", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("adds a new model", async () => {
      await router.addModel({
        name: "gemini",
        provider: "anthropic",
        model: "gemini-2.0-flash",
      });
      expect(router.listModels()).toContain("gemini");
    });

    test("rejects adding model with unknown provider", async () => {
      await expect(
        router.addModel({
          name: "new-model",
          provider: "unknown",
          model: "m",
        })
      ).rejects.toThrow("not found");
    });

    test("rejects adding duplicate name", async () => {
      await expect(
        router.addModel({
          name: "sonnet",
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250514",
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

  describe("CRUD — providers", () => {
    let router: ModelRouter;

    beforeEach(async () => {
      await writeConfig(validConfig);
      router = await ModelRouter.load(configPath);
    });

    test("lists providers", () => {
      const providers = router.listProviders();
      expect(providers.map((p) => p.id)).toContain("anthropic");
      expect(providers.map((p) => p.id)).toContain("openai");
    });

    test("adds a new provider", async () => {
      await router.addProvider({
        id: "google",
        type: "google",
        apiKeyEnvVar: "GOOGLE_AI_API_KEY",
      });
      expect(router.listProviders().map((p) => p.id)).toContain("google");
    });

    test("rejects adding duplicate provider id", async () => {
      await expect(
        router.addProvider({
          id: "anthropic",
          type: "anthropic",
          apiKeyEnvVar: "X",
        })
      ).rejects.toThrow("already exists");
    });

    test("removes a provider not referenced by any model", async () => {
      await router.addProvider({
        id: "google",
        type: "google",
        apiKeyEnvVar: "GOOGLE_AI_API_KEY",
      });
      await router.removeProvider("google");
      expect(router.listProviders().map((p) => p.id)).not.toContain("google");
    });

    test("cannot remove provider referenced by a model", async () => {
      await expect(router.removeProvider("anthropic")).rejects.toThrow(
        "still referenced by model"
      );
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
        expect(() => router.getStreamOptions()).toThrow("API key not found");
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
