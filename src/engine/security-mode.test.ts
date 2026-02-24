import { describe, it, expect } from "bun:test";
import { SecurityModeManager, describeModeEffects } from "./security-mode.js";

describe("SecurityModeManager", () => {
  it("returns 'default' for sessions with no mode set", () => {
    const mgr = new SecurityModeManager();
    expect(mgr.getMode("session-1")).toBe("default");
  });

  it("sets and gets trusted mode", () => {
    const mgr = new SecurityModeManager();
    const result = mgr.setMode("session-1", "trusted");
    expect(result.ok).toBe(true);
    expect(mgr.getMode("session-1")).toBe("trusted");
  });

  it("sets and gets unrestricted mode", () => {
    const mgr = new SecurityModeManager();
    const result = mgr.setMode("session-1", "unrestricted");
    expect(result.ok).toBe(true);
    expect(mgr.getMode("session-1")).toBe("unrestricted");
  });

  it("reverts to default when mode is set to 'default'", () => {
    const mgr = new SecurityModeManager();
    mgr.setMode("session-1", "trusted");
    expect(mgr.getMode("session-1")).toBe("trusted");

    mgr.setMode("session-1", "default");
    expect(mgr.getMode("session-1")).toBe("default");
  });

  it("auto-reverts after TTL expires", () => {
    const mgr = new SecurityModeManager({
      modeTTL: { trusted: 0.001 }, // 1ms
    });
    mgr.setMode("session-1", "trusted");

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 10) { /* spin */ }

    expect(mgr.getMode("session-1")).toBe("default");
  });

  it("clears mode on session destroy", () => {
    const mgr = new SecurityModeManager();
    mgr.setMode("session-1", "trusted");
    expect(mgr.getMode("session-1")).toBe("trusted");

    mgr.clearMode("session-1");
    expect(mgr.getMode("session-1")).toBe("default");
  });

  it("blocks unrestricted from IM when config disabled", () => {
    const mgr = new SecurityModeManager({ allowUnrestrictedFromIM: false });
    const result = mgr.setMode("session-1", "unrestricted", { isIM: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not allowed");
    }
    expect(mgr.getMode("session-1")).toBe("default");
  });

  it("allows unrestricted from IM when config enabled", () => {
    const mgr = new SecurityModeManager({ allowUnrestrictedFromIM: true });
    const result = mgr.setMode("session-1", "unrestricted", { isIM: true });
    expect(result.ok).toBe(true);
    expect(mgr.getMode("session-1")).toBe("unrestricted");
  });

  it("allows unrestricted from non-IM regardless of config", () => {
    const mgr = new SecurityModeManager({ allowUnrestrictedFromIM: false });
    const result = mgr.setMode("session-1", "unrestricted");
    expect(result.ok).toBe(true);
    expect(mgr.getMode("session-1")).toBe("unrestricted");
  });

  it("returns remaining TTL in seconds", () => {
    const mgr = new SecurityModeManager({
      modeTTL: { trusted: 3600 },
    });
    mgr.setMode("session-1", "trusted");
    const remaining = mgr.getRemainingTTL("session-1");
    expect(remaining).toBeGreaterThan(3590);
    expect(remaining).toBeLessThanOrEqual(3600);
  });

  it("returns 0 remaining TTL for sessions with no mode", () => {
    const mgr = new SecurityModeManager();
    expect(mgr.getRemainingTTL("session-1")).toBe(0);
  });

  it("uses configurable default mode", () => {
    const mgr = new SecurityModeManager({ defaultMode: "trusted" });
    // This doesn't mean sessions start in trusted — it just means that's the "base"
    // In practice, default should usually be "default"
    expect(mgr.getMode("session-1")).toBe("trusted");
  });

  it("uses default TTLs when not configured", () => {
    const mgr = new SecurityModeManager();
    const result = mgr.setMode("session-1", "trusted");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedExpiry = Date.now() + 3600 * 1000;
      expect(result.expiresAt).toBeGreaterThan(expectedExpiry - 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
    }
  });

  it("getModeState returns null for expired sessions", () => {
    const mgr = new SecurityModeManager({
      modeTTL: { trusted: 0.001 },
    });
    mgr.setMode("session-1", "trusted");

    const start = Date.now();
    while (Date.now() - start < 10) { /* spin */ }

    expect(mgr.getModeState("session-1")).toBeNull();
  });

  it("per-session isolation — different sessions have different modes", () => {
    const mgr = new SecurityModeManager();
    mgr.setMode("session-1", "trusted");
    mgr.setMode("session-2", "unrestricted");

    expect(mgr.getMode("session-1")).toBe("trusted");
    expect(mgr.getMode("session-2")).toBe("unrestricted");
    expect(mgr.getMode("session-3")).toBe("default");
  });
});

describe("describeModeEffects", () => {
  it("describes default mode", () => {
    const desc = describeModeEffects("default", 0);
    expect(desc).toContain("DEFAULT");
    expect(desc).toContain("All security layers active");
  });

  it("describes trusted mode with TTL", () => {
    const desc = describeModeEffects("trusted", 3600);
    expect(desc).toContain("TRUSTED");
    expect(desc).toContain("60 minutes");
    expect(desc).toContain("Content framing: still active");
  });

  it("describes unrestricted mode with TTL", () => {
    const desc = describeModeEffects("unrestricted", 1800);
    expect(desc).toContain("UNRESTRICTED");
    expect(desc).toContain("30 minutes");
    expect(desc).toContain("Audit log: still active");
  });
});
