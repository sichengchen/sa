import type { Session, ConnectorType } from "@aria/shared/types.js";
import type { OperationalStore } from "../../../src/engine/operational-store.js";

/** Generate a random suffix for session IDs (full 128-bit UUID) */
function randomSuffix(): string {
  return crypto.randomUUID();
}

/** Manages active sessions between Engine and Connectors.
 *
 * Session IDs use a structured `<prefix>:<suffix>` format:
 *   main:<id>                    — engine-level main session
 *   tui:<id>                     — TUI connector session
 *   telegram:<chatId>:<id>       — Telegram per-chat session
 *   discord:<channelId>:<id>     — Discord per-channel session
 *   cron:<task-name>:<id>        — isolated cron task session
 *   webhook:<slug>:<id>          — webhook-triggered session
 */
export class SessionManager {
  private sessions = new Map<string, Session>();
  private store?: OperationalStore;

  constructor(store?: OperationalStore) {
    this.store = store;
  }

  /** Create a new session under a prefix with a generated unique suffix.
   *  e.g. create("main", "engine") → "main:a1b2c3d4"
   *       create("telegram:123456", "telegram") → "telegram:123456:e5f6g7h8"
   */
  create(prefix: string, connectorType: ConnectorType): Session {
    const id = `${prefix}:${randomSuffix()}`;
    const session: Session = {
      id,
      connectorType,
      connectorId: prefix,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    if (this.store) {
      this.store.upsertSession(session);
    } else {
      this.sessions.set(id, session);
    }
    return session;
  }

  /** Retrieve a session by its full ID */
  getSession(sessionId: string): Session | undefined {
    return this.store?.getSession(sessionId) ?? this.sessions.get(sessionId);
  }

  /** List all active sessions */
  listSessions(): Session[] {
    return this.store?.listSessions() ?? Array.from(this.sessions.values());
  }

  /** List all sessions whose ID starts with the given prefix.
   *  e.g. listByPrefix("telegram:123456") returns all sessions for that chat.
   */
  listByPrefix(prefix: string): Session[] {
    if (this.store) {
      return this.store.listByPrefix(prefix);
    }
    const needle = prefix + ":";
    return Array.from(this.sessions.values()).filter((s) => s.id.startsWith(needle));
  }

  /** Get the most recently active session under a prefix, or undefined. */
  getLatest(prefix: string): Session | undefined {
    if (this.store) {
      return this.store.getLatest(prefix);
    }
    const matches = this.listByPrefix(prefix);
    if (matches.length === 0) return undefined;
    return matches.reduce((a, b) => (a.lastActiveAt >= b.lastActiveAt ? a : b));
  }

  /** Parse the prefix from a session ID.
   *  "main:a1b2" → "main"
   *  "cron:daily-report:x7y8" → "cron:daily-report"
   *  "telegram:123456:e5f6" → "telegram:123456"
   */
  static getPrefix(sessionId: string): string {
    const lastColon = sessionId.lastIndexOf(":");
    if (lastColon <= 0) return sessionId;
    return sessionId.slice(0, lastColon);
  }

  /** Parse the type (first segment) from a session ID.
   *  "telegram:123456:e5f6" → "telegram"
   *  "main:a1b2" → "main"
   *  "cron:daily-report:x7y8" → "cron"
   */
  static getType(sessionId: string): string {
    const firstColon = sessionId.indexOf(":");
    if (firstColon < 0) return sessionId;
    return sessionId.slice(0, firstColon);
  }

  /** Transfer a session to a different Connector */
  transferSession(
    sessionId: string,
    targetConnectorId: string,
    targetConnectorType?: ConnectorType,
  ): Session {
    const session = this.sessions.get(sessionId) ?? this.store?.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.connectorId = targetConnectorId;
    if (targetConnectorType) {
      session.connectorType = targetConnectorType;
    }
    session.lastActiveAt = Date.now();
    if (this.store) {
      this.store.upsertSession(session);
    } else {
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /** Destroy a session */
  destroySession(sessionId: string): boolean {
    if (this.store) {
      return this.store.destroySession(sessionId);
    }
    return this.sessions.delete(sessionId);
  }

  /** Touch a session to update lastActiveAt */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
      if (this.store) {
        this.store.upsertSession(session);
      }
      return;
    }

    if (this.store) {
      const persisted = this.store.getSession(sessionId);
      if (persisted) {
        persisted.lastActiveAt = Date.now();
        this.store.upsertSession(persisted);
      }
    }
  }
}
