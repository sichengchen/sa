import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { AuthManager } from "@sa/engine/auth.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const testHome = join(tmpdir(), "sa-test-auth-" + Date.now());

beforeEach(async () => {
  await mkdir(testHome, { recursive: true });
});

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

describe("AuthManager", () => {
  describe("init", () => {
    test("generates a 64-char hex master token", async () => {
      const auth = new AuthManager(testHome);
      const token = await auth.init();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    test("writes token file", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      expect(existsSync(join(testHome, "engine.token"))).toBe(true);
    });
  });

  describe("cleanup", () => {
    test("removes token file", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      await auth.cleanup();
      expect(existsSync(join(testHome, "engine.token"))).toBe(false);
    });
  });

  describe("generatePairingCode", () => {
    test("generates an 8-char alphanumeric code by default", () => {
      const auth = new AuthManager(testHome);
      const code = auth.generatePairingCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
    });
  });

  describe("pair", () => {
    test("pairs with master token", async () => {
      const auth = new AuthManager(testHome);
      const masterToken = await auth.init();
      const result = auth.pair(masterToken, "tui-1", "tui");
      expect(result.success).toBe(true);
      expect(result.token).toBeTruthy();
      expect(result.token).toHaveLength(64);
    });

    test("pairs with pairing code", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      const code = auth.generatePairingCode();
      const result = auth.pair(code, "tg-1", "telegram");
      expect(result.success).toBe(true);
      expect(result.token).toBeTruthy();
    });

    test("pairing code is single-use", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      const code = auth.generatePairingCode();
      auth.pair(code, "tg-1", "telegram");
      const result = auth.pair(code, "tg-2", "telegram");
      expect(result.success).toBe(false);
    });

    test("rejects invalid credential", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      const result = auth.pair("invalid", "tui-1", "tui");
      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
    });
  });

  describe("validate", () => {
    test("validates master token", async () => {
      const auth = new AuthManager(testHome);
      const masterToken = await auth.init();
      const entry = auth.validate(masterToken);
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("master");
    });

    test("validates paired session token", async () => {
      const auth = new AuthManager(testHome);
      const masterToken = await auth.init();
      const { token } = auth.pair(masterToken, "tui-1", "tui");
      const entry = auth.validate(token!);
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("tui-1");
      expect(entry!.connectorType).toBe("tui");
    });

    test("rejects invalid token", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      expect(auth.validate("invalid")).toBeNull();
    });
  });

  describe("revoke", () => {
    test("revokes a paired token", async () => {
      const auth = new AuthManager(testHome);
      const masterToken = await auth.init();
      const { token } = auth.pair(masterToken, "tui-1", "tui");
      expect(auth.revoke(token!)).toBe(true);
      expect(auth.validate(token!)).toBeNull();
    });

    test("returns false for unknown token", async () => {
      const auth = new AuthManager(testHome);
      await auth.init();
      expect(auth.revoke("nonexistent")).toBe(false);
    });
  });

  describe("readTokenFromFile", () => {
    test("reads token from file", async () => {
      const auth = new AuthManager(testHome);
      const masterToken = await auth.init();
      const read = AuthManager.readTokenFromFile(testHome);
      expect(read).toBe(masterToken);
    });

    test("returns null when no file exists", () => {
      const read = AuthManager.readTokenFromFile(join(testHome, "nonexistent"));
      expect(read).toBeNull();
    });
  });
});
