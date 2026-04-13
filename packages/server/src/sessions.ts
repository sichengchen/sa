import type { ConnectorType, Session } from "@aria/protocol";
import type { OperationalStore } from "@aria/store/operational-store";

function randomSuffix(): string {
  return crypto.randomUUID();
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private store?: OperationalStore;

  constructor(store?: OperationalStore) {
    this.store = store;
  }

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

  getSession(sessionId: string): Session | undefined {
    return this.store?.getSession(sessionId) ?? this.sessions.get(sessionId);
  }

  listSessions(): Session[] {
    return this.store?.listSessions() ?? Array.from(this.sessions.values());
  }

  listByPrefix(prefix: string): Session[] {
    if (this.store) {
      return this.store.listByPrefix(prefix);
    }
    const needle = `${prefix}:`;
    return Array.from(this.sessions.values()).filter((session) => session.id.startsWith(needle));
  }

  getLatest(prefix: string): Session | undefined {
    if (this.store) {
      return this.store.getLatest(prefix);
    }
    const matches = this.listByPrefix(prefix);
    if (matches.length === 0) return undefined;
    return matches.reduce((left, right) =>
      left.lastActiveAt >= right.lastActiveAt ? left : right,
    );
  }

  static getPrefix(sessionId: string): string {
    const lastColon = sessionId.lastIndexOf(":");
    if (lastColon <= 0) return sessionId;
    return sessionId.slice(0, lastColon);
  }

  static getType(sessionId: string): string {
    const firstColon = sessionId.indexOf(":");
    if (firstColon < 0) return sessionId;
    return sessionId.slice(0, firstColon);
  }

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

  destroySession(sessionId: string): boolean {
    if (this.store) {
      return this.store.destroySession(sessionId);
    }
    return this.sessions.delete(sessionId);
  }

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
