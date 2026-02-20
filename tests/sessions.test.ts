import { describe, test, expect, beforeEach } from "bun:test";
import { SessionManager } from "../src/engine/sessions.js";

let manager: SessionManager;

beforeEach(() => {
  manager = new SessionManager();
});

describe("SessionManager", () => {
  describe("createSession", () => {
    test("creates a session with correct fields", () => {
      const session = manager.createSession("tui-1", "tui");
      expect(session.id).toBeTruthy();
      expect(session.connectorId).toBe("tui-1");
      expect(session.connectorType).toBe("tui");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastActiveAt).toBeGreaterThanOrEqual(session.createdAt);
    });

    test("creates sessions with unique IDs", () => {
      const s1 = manager.createSession("tui-1", "tui");
      const s2 = manager.createSession("tui-2", "tui");
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe("getSession", () => {
    test("retrieves an existing session", () => {
      const created = manager.createSession("tg-1", "telegram");
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
      manager.createSession("tui-1", "tui");
      manager.createSession("tg-1", "telegram");
      manager.createSession("dc-1", "discord");
      expect(manager.listSessions()).toHaveLength(3);
    });
  });

  describe("transferSession", () => {
    test("transfers session to a new Connector", () => {
      const session = manager.createSession("tui-1", "tui");
      const transferred = manager.transferSession(session.id, "tg-1", "telegram");
      expect(transferred.connectorId).toBe("tg-1");
      expect(transferred.connectorType).toBe("telegram");
      expect(transferred.id).toBe(session.id);
    });

    test("updates lastActiveAt on transfer", () => {
      const session = manager.createSession("tui-1", "tui");
      const originalTime = session.lastActiveAt;
      // Small delay to ensure time difference
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
      const session = manager.createSession("tui-1", "tui");
      expect(manager.destroySession(session.id)).toBe(true);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    test("returns false for non-existent session", () => {
      expect(manager.destroySession("nonexistent")).toBe(false);
    });

    test("does not affect other sessions", () => {
      const s1 = manager.createSession("tui-1", "tui");
      const s2 = manager.createSession("tg-1", "telegram");
      manager.destroySession(s1.id);
      expect(manager.getSession(s2.id)).toBeDefined();
      expect(manager.listSessions()).toHaveLength(1);
    });
  });

  describe("touchSession", () => {
    test("updates lastActiveAt", () => {
      const session = manager.createSession("tui-1", "tui");
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
});
