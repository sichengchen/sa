import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, hostname } from "node:os";
import { randomBytes, scryptSync, createCipheriv } from "node:crypto";
import { loadSecrets, saveSecrets, _internal } from "./secrets.js";
import type { SecretsFile } from "./types.js";

describe("secrets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aria-secrets-test-"));
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
    const salt1 = await readFile(join(dir, ".salt"), "utf-8");

    await saveSecrets(dir, { apiKeys: { KEY2: "val2" } });
    const salt2 = await readFile(join(dir, ".salt"), "utf-8");

    expect(salt1).toBe(salt2);
  });

  it("returns null and logs a warning for a corrupted secrets.enc", async () => {
    await writeFile(join(dir, "secrets.enc"), "this is not valid json");

    const originalWarn = console.warn;
    let warnMessage = "";
    console.warn = (msg: string) => {
      warnMessage = msg;
    };

    const result = await loadSecrets(dir);

    console.warn = originalWarn;
    expect(result).toBeNull();
    expect(warnMessage).toContain("could not be decrypted");
  });

  it("sets .salt file permissions to 0600", async () => {
    await saveSecrets(dir, { apiKeys: { KEY: "val" } });
    const saltStat = await stat(join(dir, ".salt"));
    expect(saltStat.mode & 0o777).toBe(0o600);
  });

  it("sets secrets.enc file permissions to 0600", async () => {
    await saveSecrets(dir, { apiKeys: { KEY: "val" } });
    const encStat = await stat(join(dir, "secrets.enc"));
    expect(encStat.mode & 0o777).toBe(0o600);
  });
});

describe("key derivation", () => {
  it("machine fingerprint includes hostname and username", () => {
    const fp = _internal.machineFingerprint();
    expect(fp).toContain(hostname());
    expect(fp.split(":").length).toBeGreaterThanOrEqual(3);
  });

  it("new derivation produces a 32-byte key", () => {
    const salt = randomBytes(32);
    const key = _internal.deriveKey(salt);
    expect(key.length).toBe(32);
  });
});

describe("unsupported legacy secrets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aria-secrets-invalid-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeLegacySecrets(homeDir: string, secrets: SecretsFile): Promise<void> {
    const salt = randomBytes(32);
    await writeFile(join(homeDir, ".salt"), salt.toString("hex") + "\n");

    const key = scryptSync(hostname(), salt, 32) as Buffer;

    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = JSON.stringify(secrets);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const encData = JSON.stringify({
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      data: encrypted.toString("hex"),
    });

    await writeFile(join(homeDir, "secrets.enc"), encData);
  }

  it("rejects hostname-only legacy secrets without migrating them", async () => {
    const secrets: SecretsFile = {
      apiKeys: { LEGACY_KEY: "legacy-value-123" },
    };

    await writeLegacySecrets(dir, secrets);

    const originalWarn = console.warn;
    let warnMessage = "";
    console.warn = (msg: string) => {
      warnMessage = msg;
    };

    const loaded = await loadSecrets(dir);

    console.warn = originalWarn;
    expect(loaded).toBeNull();
    expect(warnMessage).toContain("unsupported legacy runtime");
  });

  it("returns null with specific warning for unrecoverable corruption", async () => {
    await writeFile(join(dir, ".salt"), randomBytes(32).toString("hex") + "\n");
    await writeFile(
      join(dir, "secrets.enc"),
      JSON.stringify({
        iv: randomBytes(16).toString("hex"),
        authTag: randomBytes(16).toString("hex"),
        data: randomBytes(64).toString("hex"),
      }),
    );

    const originalWarn = console.warn;
    let warnMessage = "";
    console.warn = (msg: string) => {
      warnMessage = msg;
    };

    const result = await loadSecrets(dir);

    console.warn = originalWarn;
    expect(result).toBeNull();
    expect(warnMessage).toContain("could not be decrypted");
  });
});
