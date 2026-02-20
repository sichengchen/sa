import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager } from "../../src/engine/config/index.js";
import { ModelRouter } from "../../src/engine/router/index.js";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testHome = join(tmpdir(), "sa-integration-config-" + Date.now());

beforeEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

describe("Config + Router integration", () => {
  test("ConfigManager creates defaults, Router loads them", async () => {
    const config = new ConfigManager(testHome);
    const saConfig = await config.load();

    // Config creates default models.json
    const router = await ModelRouter.load(config.getModelsPath());
    expect(router.listModels()).toContain("sonnet");
    expect(router.getActiveModelName()).toBe("sonnet");
  });

  test("Custom config with multiple models supports switching", async () => {
    // Create custom v2 config
    await mkdir(testHome, { recursive: true });
    const models = {
      version: 2,
      default: "fast",
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
          name: "fast",
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250514",
          temperature: 0.5,
        },
        {
          name: "smart",
          provider: "openai",
          model: "gpt-4o",
          temperature: 0.3,
        },
      ],
    };
    await writeFile(join(testHome, "models.json"), JSON.stringify(models));

    const config = new ConfigManager(testHome);
    await config.load();

    const router = await ModelRouter.load(config.getModelsPath());
    expect(router.getActiveModelName()).toBe("fast");

    router.switchModel("smart");
    expect(router.getActiveModelName()).toBe("smart");

    const cfg = router.getConfig();
    expect(cfg.provider).toBe("openai");
    expect(cfg.temperature).toBe(0.3);

    // Provider resolution
    const provider = router.getProvider("openai");
    expect(provider.apiKeyEnvVar).toBe("OPENAI_API_KEY");
  });

  test("Identity loads from custom IDENTITY.md", async () => {
    await mkdir(testHome, { recursive: true });
    await writeFile(
      join(testHome, "IDENTITY.md"),
      "# TestBot\n\n## Personality\nTest personality.\n\n## System Prompt\nYou are TestBot.\n"
    );

    const config = new ConfigManager(testHome);
    const saConfig = await config.load();

    expect(saConfig.identity.name).toBe("TestBot");
    expect(saConfig.identity.personality).toBe("Test personality.");
    expect(saConfig.identity.systemPrompt).toBe("You are TestBot.");
  });
});
