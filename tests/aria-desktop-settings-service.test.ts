import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConfigManager } from "@aria/server/config";

const previousAriaHome = process.env.ARIA_HOME;
let runtimeHome: string;

beforeEach(async () => {
  runtimeHome = await mkdtemp(join(tmpdir(), "aria-desktop-settings-"));
  process.env.ARIA_HOME = runtimeHome;
});

afterEach(async () => {
  if (previousAriaHome) {
    process.env.ARIA_HOME = previousAriaHome;
  } else {
    delete process.env.ARIA_HOME;
  }
  await rm(runtimeHome, { force: true, recursive: true });
});

describe("DesktopSettingsService", () => {
  test("persists provider, model, and connector configuration through the desktop settings API", async () => {
    const switchModel = vi.fn(async () => undefined);
    const { DesktopSettingsService } =
      await import("../apps/aria-desktop/src/main/desktop-settings-service.js");
    const service = new DesktopSettingsService(
      join(runtimeHome, "desktop-settings.json"),
      {
        model: { switch: { mutate: switchModel } },
      } as any,
      {
        getLoginItemSettings: () => ({ openAtLogin: false }),
        getPath: () => runtimeHome,
        setLoginItemSettings: vi.fn(),
      },
    );

    await service.getSettingsState();

    let state = await service.updateSettings({
      provider: {
        add: {
          apiKey: "sk-openai-test",
          apiKeyEnvVar: "OPENAI_API_KEY",
          id: "openai",
          type: "openai",
        },
      },
    });

    expect(state.runtime.providers.find((provider) => provider.id === "openai")).toMatchObject({
      apiKeyConfigured: true,
      apiKeyEnvVar: "OPENAI_API_KEY",
      modelCount: 0,
      type: "openai",
    });

    state = await service.updateSettings({
      model: {
        add: {
          maxTokens: 12000,
          model: "gpt-4o",
          name: "gpt4o",
          provider: "openai",
          temperature: 0.2,
          type: "chat",
        },
      },
    });
    expect(state.runtime.models.find((model) => model.name === "gpt4o")).toMatchObject({
      maxTokens: 12000,
      model: "gpt-4o",
      provider: "openai",
      temperature: 0.2,
      type: "chat",
    });

    state = await service.updateSettings({
      model: {
        setDefault: "gpt4o",
        setTier: {
          modelName: "gpt4o",
          tier: "normal",
        },
      },
    });
    expect(switchModel).toHaveBeenCalledWith({ name: "gpt4o" });
    expect(state.runtime.defaultModel).toBe("gpt4o");
    expect(state.runtime.modelTiers.normal).toBe("gpt4o");

    state = await service.updateSettings({
      connector: {
        setApproval: {
          connector: "slack",
          mode: "always",
        },
        updateSecrets: [{ key: "SLACK_BOT_TOKEN", value: "xoxb-test" }],
        webhookEnabled: true,
      },
    });

    expect(state.connectors.find((connector) => connector.name === "slack")).toMatchObject({
      approval: "always",
      configured: true,
    });
    expect(state.connectors.find((connector) => connector.name === "webhook")).toMatchObject({
      configured: true,
      webhookEnabled: true,
    });

    const config = new ConfigManager(runtimeHome);
    await config.load();
    const configFile = config.getConfigFile();
    const secrets = await config.loadSecrets();

    expect(configFile.providers.some((provider) => provider.id === "openai")).toBe(true);
    expect(configFile.defaultModel).toBe("gpt4o");
    expect(configFile.runtime.modelTiers?.normal).toBe("gpt4o");
    expect(configFile.runtime.toolApproval?.slack).toBe("always");
    expect(configFile.runtime.webhook?.enabled).toBe(true);
    expect(secrets?.apiKeys?.OPENAI_API_KEY).toBe("sk-openai-test");
    expect(secrets?.apiKeys?.SLACK_BOT_TOKEN).toBe("xoxb-test");
    expect(existsSync(join(runtimeHome, "desktop-settings.json"))).toBe(true);
  });
});
