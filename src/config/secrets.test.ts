import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSecrets, saveSecrets } from "./secrets.js";
import type { SecretsFile } from "./types.js";

describe("secrets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sa-secrets-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when secrets.enc does not exist", async () => {
    const result = await loadSecrets(dir);
    expect(result).toBeNull();
  });

  it("round-trips a SecretsFile through save and load", async () => {
    const secrets: SecretsFile = {
      apiKeys: { ANTHROPIC_API_KEY: "sk-ant-test-key-123" },
      botToken: "1234567890:AAEtest-telegram-token",
    };

    await saveSecrets(dir, secrets);
    const loaded = await loadSecrets(dir);

    expect(loaded).not.toBeNull();
    expect(loaded!.apiKeys.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
    expect(loaded!.botToken).toBe("1234567890:AAEtest-telegram-token");
  });

  it("round-trips a SecretsFile without botToken", async () => {
    const secrets: SecretsFile = {
      apiKeys: { OPENAI_API_KEY: "sk-openai-key-456" },
    };

    await saveSecrets(dir, secrets);
    const loaded = await loadSecrets(dir);

    expect(loaded).not.toBeNull();
    expect(loaded!.apiKeys.OPENAI_API_KEY).toBe("sk-openai-key-456");
    expect(loaded!.botToken).toBeUndefined();
  });

  it("round-trips multiple API keys", async () => {
    const secrets: SecretsFile = {
      apiKeys: {
        ANTHROPIC_API_KEY: "sk-ant-key",
        OPENAI_API_KEY: "sk-openai-key",
        GOOGLE_AI_API_KEY: "google-key",
      },
    };

    await saveSecrets(dir, secrets);
    const loaded = await loadSecrets(dir);

    expect(loaded!.apiKeys.ANTHROPIC_API_KEY).toBe("sk-ant-key");
    expect(loaded!.apiKeys.OPENAI_API_KEY).toBe("sk-openai-key");
    expect(loaded!.apiKeys.GOOGLE_AI_API_KEY).toBe("google-key");
  });

  it("creates secrets.enc and .salt files on save", async () => {
    await saveSecrets(dir, { apiKeys: { MY_KEY: "value" } });

    expect(existsSync(join(dir, "secrets.enc"))).toBe(true);
    expect(existsSync(join(dir, ".salt"))).toBe(true);
  });

  it("reuses the existing salt on subsequent saves", async () => {
    await saveSecrets(dir, { apiKeys: { KEY1: "val1" } });
    const { readFile } = await import("node:fs/promises");
    const salt1 = await readFile(join(dir, ".salt"), "utf-8");

    await saveSecrets(dir, { apiKeys: { KEY2: "val2" } });
    const salt2 = await readFile(join(dir, ".salt"), "utf-8");

    expect(salt1).toBe(salt2);
  });

  it("returns null and logs a warning for a corrupted secrets.enc", async () => {
    const { writeFile } = await import("node:fs/promises");
    // Write an invalid (non-JSON) encrypted file
    await writeFile(join(dir, "secrets.enc"), "this is not valid json");

    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };

    const result = await loadSecrets(dir);

    console.warn = originalWarn;
    expect(result).toBeNull();
    expect(warned).toBe(true);
  });
});
