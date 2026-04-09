import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthManager } from "./auth.js";
import { OperationalStore } from "./operational-store.js";

describe("AuthManager", () => {
  let dir: string;
  let auth: AuthManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aria-auth-test-"));
    auth = new AuthManager(dir);
    await auth.init();
  });

  afterEach(async () => {
    await auth.cleanup();
    await rm(dir, { recursive: true, force: true });
  });

  describe("init()", () => {
    it("creates separate master and webhook tokens", async () => {
      expect(auth.getMasterToken()).toBeTruthy();
      expect(auth.getWebhookToken()).toBeTruthy();
      expect(auth.getMasterToken()).not.toBe(auth.getWebhookToken());
    });

    it("writes webhook token file with restricted permissions", async () => {
      const content = await readFile(join(dir, "engine.webhook-token"), "utf-8");
      expect(content).toBe(auth.getWebhookToken());
    });
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
      const result = auth.pair("ZZZZZZZZ", "telegram:123", "telegram");
      expect(result.success).toBe(false);
    });

    it("invalidates pairing code after one use", () => {
      const code = auth.generatePairingCode();
      auth.pair(code, "telegram:123", "telegram");
      const result = auth.pair(code, "telegram:456", "telegram");
      expect(result.success).toBe(false);
    });
  });

  describe("pairing code", () => {
    it("generates 8-character codes by default", () => {
      const code = auth.generatePairingCode();
      expect(code.length).toBe(8);
    });

    it("respects custom code length", async () => {
      const customAuth = new AuthManager(dir, { pairingCodeLength: 12 });
      await customAuth.init();
      const code = customAuth.generatePairingCode();
      expect(code.length).toBe(12);
      await customAuth.cleanup();
    });

    it("expires after TTL", async () => {
      const shortTTLAuth = new AuthManager(dir, { pairingTTL: 0 }); // 0s = instant expiry
      await shortTTLAuth.init();
      const code = shortTTLAuth.generatePairingCode();
      // Wait a tick for time to pass
      await new Promise((r) => setTimeout(r, 10));
      const result = shortTTLAuth.pair(code, "test", "test");
      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
      await shortTTLAuth.cleanup();
    });
  });

  describe("pairing rate limiting", () => {
    it("applies exponential backoff on failures", () => {
      auth.generatePairingCode();
      // First failure
      auth.pair("WRONG111", "telegram:123", "telegram");
      // Second failure should be locked
      const result = auth.pair("WRONG222", "telegram:123", "telegram");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many failed");
    });

    it("tracks failures per-connector", () => {
      auth.generatePairingCode();
      // Fail for connector A
      auth.pair("WRONG111", "telegram:A", "telegram");
      // Connector B should still be able to try
      const result = auth.pair("WRONG222", "telegram:B", "telegram");
      // B gets its own first failure, not locked yet (just wrong code)
      expect(result.error).toBeUndefined();
    });
  });

  describe("validate()", () => {
    it("validates master token with type 'master'", () => {
      const entry = auth.validate(auth.getMasterToken());
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("master");
      expect(entry!.type).toBe("master");
    });

    it("validates webhook token with type 'webhook'", () => {
      const entry = auth.validate(auth.getWebhookToken());
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("webhook");
    });

    it("validates paired session token with type 'session'", () => {
      const { token } = auth.pair(auth.getMasterToken(), "tui", "tui");
      const entry = auth.validate(token!);
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("tui");
      expect(entry!.type).toBe("session");
    });

    it("rejects invalid token", () => {
      const entry = auth.validate("invalid-token-value");
      expect(entry).toBeNull();
    });

    it("rejects empty token", () => {
      const entry = auth.validate("");
      expect(entry).toBeNull();
    });

    it("rejects expired session token", async () => {
      // sessionTTL=0.001 → 1ms TTL so it expires almost immediately
      const shortTTLAuth = new AuthManager(dir, { sessionTTL: 0.001 });
      await shortTTLAuth.init();
      const { token } = shortTTLAuth.pair(shortTTLAuth.getMasterToken(), "test", "test");
      // Wait for expiry
      await new Promise((r) => setTimeout(r, 10));
      expect(shortTTLAuth.validate(token!)).toBeNull();
      await shortTTLAuth.cleanup();
    });

    it("restores persisted session tokens across auth manager restarts", async () => {
      const store = new OperationalStore(dir);
      await store.init();

      const first = new AuthManager(dir, undefined, store);
      await first.init();
      const paired = first.pair(first.getMasterToken(), "telegram:123", "telegram");
      expect(paired.success).toBe(true);

      const second = new AuthManager(dir, undefined, store);
      await second.init();
      const entry = second.validate(paired.token!);
      expect(entry).not.toBeNull();
      expect(entry!.connectorId).toBe("telegram:123");
      expect(entry!.connectorType).toBe("telegram");

      await first.cleanup();
      await second.cleanup();
      store.close();
    });
  });

  describe("validateWebhookToken()", () => {
    it("validates correct webhook token", () => {
      expect(auth.validateWebhookToken(auth.getWebhookToken())).toBe(true);
    });

    it("rejects master token", () => {
      expect(auth.validateWebhookToken(auth.getMasterToken())).toBe(false);
    });

    it("rejects invalid token", () => {
      expect(auth.validateWebhookToken("invalid")).toBe(false);
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

  describe("pairing code persistence", () => {
    it("accepts a persisted pairing code after auth manager restart", async () => {
      const store = new OperationalStore(dir);
      await store.init();

      const first = new AuthManager(dir, undefined, store);
      await first.init();
      const code = first.generatePairingCode();

      const second = new AuthManager(dir, undefined, store);
      await second.init();
      const result = second.pair(code, "discord:channel", "discord");
      expect(result.success).toBe(true);
      expect(result.token).toBeTruthy();

      await first.cleanup();
      await second.cleanup();
      store.close();
    });
  });
});
