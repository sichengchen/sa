import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveSecrets } from "@aria/engine/config/secrets.js";
import { DEFAULT_WECHAT_API_BASE_URL, loadWeChatAccounts, normalizeWeChatAccount, upsertWeChatAccount } from "./config.js";

const ORIGINAL_ENV = { ...process.env };

describe("wechat config", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("normalizes the base URL and user list", () => {
    expect(normalizeWeChatAccount({
      accountId: " wx-alias ",
      botToken: " token ",
      apiBaseUrl: "https://example.com/api",
      allowedUserIds: [" alice ", "alice", "bob"],
    })).toEqual({
      accountId: "wx-alias",
      botToken: "token",
      apiBaseUrl: "https://example.com/api/",
      allowedUserIds: ["alice", "bob"],
    });
  });

  it("loads saved accounts and lets env overrides win", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "aria-wechat-config-"));
    try {
      await saveSecrets(homeDir, {
        apiKeys: {},
        wechatAccounts: [
          {
            accountId: "saved",
            botToken: "saved-token",
            apiBaseUrl: DEFAULT_WECHAT_API_BASE_URL,
          },
        ],
      });

      process.env.WECHAT_ACCOUNT_ID = "saved";
      process.env.WECHAT_BOT_TOKEN = "env-token";
      process.env.WECHAT_API_BASE_URL = "https://env.example.com";
      process.env.WECHAT_ALLOWED_USER_IDS = "alice,bob";

      const accounts = await loadWeChatAccounts(homeDir);
      expect(accounts).toEqual([
        {
          accountId: "saved",
          botToken: "env-token",
          apiBaseUrl: "https://env.example.com/",
          allowedUserIds: ["alice", "bob"],
        },
      ]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("upserts accounts without dropping existing secrets", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "aria-wechat-upsert-"));
    try {
      await saveSecrets(homeDir, {
        apiKeys: { OPENAI_API_KEY: "secret" },
        wechatAccounts: [
          {
            accountId: "alpha",
            botToken: "old-token",
          },
        ],
      });

      const next = await upsertWeChatAccount({
        accountId: "alpha",
        botToken: "new-token",
        allowedUserIds: ["owner"],
      }, homeDir);

      expect(next).toEqual([
        {
          accountId: "alpha",
          botToken: "new-token",
          apiBaseUrl: DEFAULT_WECHAT_API_BASE_URL,
          allowedUserIds: ["owner"],
        },
      ]);

      const loaded = await loadWeChatAccounts(homeDir);
      expect(loaded[0]?.botToken).toBe("new-token");
      expect(loaded[0]?.allowedUserIds).toEqual(["owner"]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
