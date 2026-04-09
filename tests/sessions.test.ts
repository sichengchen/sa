import { describe, test, expect, beforeEach } from "bun:test";
import { SessionManager } from "@aria/engine/sessions.js";

let manager: SessionManager;

beforeEach(() => {
  manager = new SessionManager();
});

describe("SessionManager", () => {
  describe("create", () => {
    test("creates a session with structured prefix:id format", () => {
      const session = manager.create("tui", "tui");
      expect(session.id).toStartWith("tui:");
      expect(session.connectorType).toBe("tui");
      expect(session.connectorId).toBe("tui");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastActiveAt).toBeGreaterThanOrEqual(session.createdAt);
    });

    test("creates sessions with unique IDs under the same prefix", () => {
      const s1 = manager.create("tui", "tui");
      const s2 = manager.create("tui", "tui");
      expect(s1.id).not.toBe(s2.id);
      expect(s1.id).toStartWith("tui:");
      expect(s2.id).toStartWith("tui:");
    });

    test("creates session with nested prefix (telegram chat)", () => {
      const session = manager.create("telegram:123456", "telegram");
      expect(session.id).toStartWith("telegram:123456:");
      expect(session.connectorType).toBe("telegram");
    });

    test("creates engine main session", () => {
      const session = manager.create("main", "engine");
      expect(session.id).toStartWith("main:");
      expect(session.connectorType).toBe("engine");
    });
  });

  describe("getSession", () => {
    test("retrieves an existing session", () => {
      const created = manager.create("telegram:123", "telegram");
      const retrieved = manager.getSession(created.id);
      expect(retrieved).toEqual(created);
    });

    test("returns undefined for non-existent session", () => {
      expect(manager.getSession("nonexistent")).toBeUndefined();
    });
  });

  describe("listSessions", () => {
    test("returns empty array when no sessions", () => {
      expect(manager.listSessions()).toEqual([]);
    });

    test("returns all created sessions", () => {
      manager.create("tui", "tui");
      manager.create("telegram:123", "telegram");
      manager.create("discord:456", "discord");
      expect(manager.listSessions()).toHaveLength(3);
    });
  });

  describe("listByPrefix", () => {
    test("returns sessions matching the prefix", () => {
      manager.create("telegram:123", "telegram");
      manager.create("telegram:123", "telegram");
      manager.create("telegram:456", "telegram");
      manager.create("tui", "tui");

      const chat123 = manager.listByPrefix("telegram:123");
      expect(chat123).toHaveLength(2);
      chat123.forEach((s) => expect(s.id).toStartWith("telegram:123:"));

      const chat456 = manager.listByPrefix("telegram:456");
      expect(chat456).toHaveLength(1);

      const tui = manager.listByPrefix("tui");
      expect(tui).toHaveLength(1);
    });

    test("returns empty array for unknown prefix", () => {
      expect(manager.listByPrefix("unknown")).toEqual([]);
    });
  });

  describe("getLatest", () => {
    test("returns the most recently active session under a prefix", () => {
      const s1 = manager.create("tui", "tui");
      const s2 = manager.create("tui", "tui");

      // Touch s1 to make it more recent
      manager.touchSession(s1.id);
      const latest = manager.getLatest("tui");
      expect(latest?.id).toBe(s1.id);
    });

    test("returns undefined for unknown prefix", () => {
      expect(manager.getLatest("unknown")).toBeUndefined();
    });

    test("returns the only session if there is one", () => {
      const s = manager.create("main", "engine");
      expect(manager.getLatest("main")?.id).toBe(s.id);
    });
  });

  describe("getPrefix (static)", () => {
    test("parses simple prefix", () => {
      expect(SessionManager.getPrefix("main:a1b2c3")).toBe("main");
    });

    test("parses nested prefix", () => {
      expect(SessionManager.getPrefix("telegram:123456:e5f6")).toBe("telegram:123456");
    });

    test("parses cron prefix", () => {
      expect(SessionManager.getPrefix("cron:daily-report:x7y8")).toBe("cron:daily-report");
    });

    test("handles no colon", () => {
      expect(SessionManager.getPrefix("noprefix")).toBe("noprefix");
    });
  });

  describe("getType (static)", () => {
    test("parses type from simple ID", () => {
      expect(SessionManager.getType("main:a1b2c3")).toBe("main");
    });

    test("parses type from nested ID", () => {
      expect(SessionManager.getType("telegram:123456:e5f6")).toBe("telegram");
    });

    test("parses type from cron ID", () => {
      expect(SessionManager.getType("cron:daily-report:x7y8")).toBe("cron");
    });

    test("handles no colon", () => {
      expect(SessionManager.getType("noprefix")).toBe("noprefix");
    });
  });

  describe("transferSession", () => {
    test("transfers session to a new Connector", () => {
      const session = manager.create("tui", "tui");
      const transferred = manager.transferSession(session.id, "tg-1", "telegram");
      expect(transferred.connectorId).toBe("tg-1");
      expect(transferred.connectorType).toBe("telegram");
      expect(transferred.id).toBe(session.id);
    });

    test("updates lastActiveAt on transfer", () => {
      const session = manager.create("tui", "tui");
      const originalTime = session.lastActiveAt;
      const transferred = manager.transferSession(session.id, "tg-1");
      expect(transferred.lastActiveAt).toBeGreaterThanOrEqual(originalTime);
    });

    test("throws for non-existent session", () => {
      expect(() => manager.transferSession("nonexistent", "tg-1")).toThrow(
        "Session not found: nonexistent",
      );
    });
  });

  describe("destroySession", () => {
    test("removes an existing session", () => {
      const session = manager.create("tui", "tui");
      expect(manager.destroySession(session.id)).toBe(true);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    test("returns false for non-existent session", () => {
      expect(manager.destroySession("nonexistent")).toBe(false);
    });

    test("does not affect other sessions", () => {
      const s1 = manager.create("tui", "tui");
      const s2 = manager.create("telegram:123", "telegram");
      manager.destroySession(s1.id);
      expect(manager.getSession(s2.id)).toBeDefined();
      expect(manager.listSessions()).toHaveLength(1);
    });
  });

  describe("touchSession", () => {
    test("updates lastActiveAt", () => {
      const session = manager.create("tui", "tui");
      const original = session.lastActiveAt;
      manager.touchSession(session.id);
      const updated = manager.getSession(session.id)!;
      expect(updated.lastActiveAt).toBeGreaterThanOrEqual(original);
    });

    test("does nothing for non-existent session", () => {
      // Should not throw
      manager.touchSession("nonexistent");
    });
  });

  describe("/new creates fresh session under same prefix", () => {
    test("new session gets unique ID, old session preserved", () => {
      const s1 = manager.create("tui", "tui");
      const s1Id = s1.id;

      // Simulate /new: create another session under same prefix
      const s2 = manager.create("tui", "tui");
      expect(s2.id).not.toBe(s1Id);
      expect(s2.id).toStartWith("tui:");

      // Old session still exists
      expect(manager.getSession(s1Id)).toBeDefined();
      expect(manager.listByPrefix("tui")).toHaveLength(2);
    });
  });
});
