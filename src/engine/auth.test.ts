import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthManager } from "./auth.js";

describe("AuthManager", () => {
  let dir: string;
  let auth: AuthManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sa-auth-test-"));
    auth = new AuthManager(dir);
    await auth.init();
  });

  afterEach(async () => {
    await auth.cleanup();
    await rm(dir, { recursive: true, force: true });
  });

  describe("pair()", () => {
    it("succeeds with correct master token", () => {
      const result = auth.pair(auth.getMasterToken(), "tui", "tui");
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
    });

    it("fails with wrong master token", () => {
      const result = auth.pair("wrong-token", "tui", "tui");
      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
    });

    it("fails with empty credential", () => {
      const result = auth.pair("", "tui", "tui");
      expect(result.success).toBe(false);
    });

    it("succeeds with correct pairing code", () => {
      const code = auth.generatePairingCode();
      const result = auth.pair(code, "telegram:123", "telegram");
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it("fails with wrong pairing code", () => {
      auth.generatePairingCode();
      const result = auth.pair("ZZZZZZ", "telegram:123", "telegram");
      expect(result.success).toBe(false);
    });

    it("invalidates pairing code after one use", () => {
      const code = auth.generatePairingCode();
      auth.pair(code, "telegram:123", "telegram");
      const result = auth.pair(code, "telegram:456", "telegram");
      expect(result.success).toBe(false);
    });
  });

  describe("validate()", () => {
    it("validates master token", () => {
      const entry = auth.validate(auth.getMasterToken());
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("master");
    });

    it("validates paired session token", () => {
      const { token } = auth.pair(auth.getMasterToken(), "tui", "tui");
      const entry = auth.validate(token!);
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("tui");
    });

    it("rejects invalid token", () => {
      const entry = auth.validate("invalid-token-value");
      expect(entry).toBeNull();
    });

    it("rejects empty token", () => {
      const entry = auth.validate("");
      expect(entry).toBeNull();
    });
  });

  describe("revoke()", () => {
    it("revokes a paired token", () => {
      const { token } = auth.pair(auth.getMasterToken(), "tui", "tui");
      expect(auth.revoke(token!)).toBe(true);
      expect(auth.validate(token!)).toBeNull();
    });

    it("returns false for unknown token", () => {
      expect(auth.revoke("nonexistent")).toBe(false);
    });
  });
});
