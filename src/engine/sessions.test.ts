import { describe, it, expect, beforeEach } from "bun:test";
import { SessionManager } from "./sessions.js";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe("session ID format", () => {
    it("generates full UUID suffixes (36 chars)", () => {
      const session = manager.create("main", "engine");
      // Format: "main:<uuid>" where uuid is 36 chars (8-4-4-4-12 with hyphens)
      const suffix = session.id.slice("main:".length);
      expect(suffix).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("generates unique session IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(manager.create("main", "engine").id);
      }
      expect(ids.size).toBe(100);
    });

    it("preserves prefix in session ID", () => {
      const session = manager.create("telegram:123456", "telegram");
      expect(session.id).toStartWith("telegram:123456:");
    });
  });

  describe("create()", () => {
    it("stores sessions retrievable by ID", () => {
      const session = manager.create("tui", "tui");
      expect(manager.getSession(session.id)).toBe(session);
    });

    it("sets connectorType and connectorId", () => {
      const session = manager.create("telegram:789", "telegram");
      expect(session.connectorType).toBe("telegram");
      expect(session.connectorId).toBe("telegram:789");
    });
  });

  describe("getPrefix()", () => {
    it("extracts prefix from simple session ID", () => {
      const session = manager.create("main", "engine");
      expect(SessionManager.getPrefix(session.id)).toBe("main");
    });

    it("extracts prefix from multi-segment session ID", () => {
      const session = manager.create("telegram:123456", "telegram");
      expect(SessionManager.getPrefix(session.id)).toBe("telegram:123456");
    });
  });

  describe("getType()", () => {
    it("extracts type from session ID", () => {
      const session = manager.create("telegram:123456", "telegram");
      expect(SessionManager.getType(session.id)).toBe("telegram");
    });
  });

  describe("listByPrefix()", () => {
    it("lists sessions by prefix", () => {
      manager.create("telegram:111", "telegram");
      manager.create("telegram:111", "telegram");
      manager.create("telegram:222", "telegram");
      expect(manager.listByPrefix("telegram:111")).toHaveLength(2);
      expect(manager.listByPrefix("telegram:222")).toHaveLength(1);
    });
  });
});
