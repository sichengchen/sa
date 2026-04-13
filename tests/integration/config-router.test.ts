import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager } from "@aria/server/config";
import { ModelRouter } from "@aria/gateway/router";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testHome = join(tmpdir(), "aria-integration-config-" + Date.now());

beforeEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

describe("Config + Router integration", () => {
  test("ConfigManager creates defaults, Router loads from config data", async () => {
    const config = new ConfigManager(testHome);
    const ariaConfig = await config.load();

    const router = ModelRouter.fromConfig({
      providers: ariaConfig.providers,
      models: ariaConfig.models,
      defaultModel: ariaConfig.defaultModel,
    });
    expect(router.listModels()).toContain("sonnet");
    expect(router.getActiveModelName()).toBe("sonnet");
  });

  test("Custom v3 config with multiple models supports switching", async () => {
    await mkdir(testHome, { recursive: true });
    const v3Config = {
      version: 3,
      runtime: {
        activeModel: "fast",
        telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
        memory: { enabled: true, directory: "memory" },
      },
      providers: [
        {
          id: "anthropic",
          type: "anthropic",
          apiKeyEnvVar: "ANTHROPIC_API_KEY",
        },
        { id: "openai", type: "openai", apiKeyEnvVar: "OPENAI_API_KEY" },
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
      defaultModel: "fast",
    };
    await writeFile(join(testHome, "config.json"), JSON.stringify(v3Config));

    const config = new ConfigManager(testHome);
    const ariaConfig = await config.load();

    const router = ModelRouter.fromConfig({
      providers: ariaConfig.providers,
      models: ariaConfig.models,
      defaultModel: ariaConfig.defaultModel,
    });
    expect(router.getActiveModelName()).toBe("fast");

    await router.switchModel("smart");
    expect(router.getActiveModelName()).toBe("smart");

    const cfg = router.getConfig();
    expect(cfg.provider).toBe("openai");
    expect(cfg.temperature).toBe(0.3);

    const provider = router.getProvider("openai");
    expect(provider.apiKeyEnvVar).toBe("OPENAI_API_KEY");
  });

  test("Identity loads from custom IDENTITY.md", async () => {
    await mkdir(testHome, { recursive: true });
    await writeFile(
      join(testHome, "IDENTITY.md"),
      "# TestBot\n\n## Personality\nTest personality.\n\n## System Prompt\nYou are TestBot.\n",
    );

    const config = new ConfigManager(testHome);
    const ariaConfig = await config.load();

    expect(ariaConfig.identity.name).toBe("TestBot");
    expect(ariaConfig.identity.personality).toBe("Test personality.");
    expect(ariaConfig.identity.systemPrompt).toBe("You are TestBot.");
  });
});
