import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveSecrets } from "@aria/server/config/secrets";
import { loadConnectorRuntimeEnv } from "@aria/cli/connector-env.js";

const testHome = join(tmpdir(), `aria-connector-env-${Date.now()}`);

beforeEach(async () => {
  await mkdir(testHome, { recursive: true });
});

afterEach(async () => {
  delete process.env.ARIA_LOG_LEVEL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.ARIA_TELEGRAM_PAIRING_CODE;
  await rm(testHome, { recursive: true, force: true });
});

describe("loadConnectorRuntimeEnv", () => {
  test("hydrates runtime env, secrets, and pairing code from the runtime home", async () => {
    await writeFile(
      join(testHome, "config.json"),
      JSON.stringify({
        version: 3,
        runtime: {
          activeModel: "default",
          telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
          memory: { enabled: true, directory: "memory" },
          env: {
            ARIA_LOG_LEVEL: "debug",
          },
        },
        providers: [],
        models: [],
        defaultModel: "default",
      }),
    );

    await saveSecrets(testHome, {
      apiKeys: {
        TELEGRAM_BOT_TOKEN: "telegram-secret",
        SLACK_BOT_TOKEN: "slack-secret",
      },
      pairingCode: "PAIRCODE1",
    });

    await loadConnectorRuntimeEnv(testHome);

    expect(process.env.ARIA_LOG_LEVEL).toBe("debug");
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("telegram-secret");
    expect(process.env.SLACK_BOT_TOKEN).toBe("slack-secret");
    expect(process.env.ARIA_TELEGRAM_PAIRING_CODE).toBe("PAIRCODE1");
  });

  test("preserves explicit process env values over runtime config and secrets", async () => {
    process.env.ARIA_LOG_LEVEL = "warn";
    process.env.TELEGRAM_BOT_TOKEN = "from-shell";
    process.env.ARIA_TELEGRAM_PAIRING_CODE = "FROMENV99";

    await writeFile(
      join(testHome, "config.json"),
      JSON.stringify({
        version: 3,
        runtime: {
          activeModel: "default",
          telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
          memory: { enabled: true, directory: "memory" },
          env: {
            ARIA_LOG_LEVEL: "debug",
          },
        },
        providers: [],
        models: [],
        defaultModel: "default",
      }),
    );

    await saveSecrets(testHome, {
      apiKeys: {
        TELEGRAM_BOT_TOKEN: "telegram-secret",
      },
      pairingCode: "PAIRCODE1",
    });

    await loadConnectorRuntimeEnv(testHome);

    expect(process.env.ARIA_LOG_LEVEL).toBe("warn");
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("from-shell");
    expect(process.env.ARIA_TELEGRAM_PAIRING_CODE).toBe("FROMENV99");
  });

  test("hydrates the legacy top-level Telegram token field when apiKeys are absent", async () => {
    await saveSecrets(testHome, {
      apiKeys: {},
      botToken: "legacy-telegram-token",
      pairingCode: "PAIRCODE1",
    });

    await loadConnectorRuntimeEnv(testHome);

    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("legacy-telegram-token");
    expect(process.env.ARIA_TELEGRAM_PAIRING_CODE).toBe("PAIRCODE1");
  });
});
