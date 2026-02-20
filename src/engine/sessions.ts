import type { Session, ConnectorType } from "../shared/types.js";

/** Manages active sessions between Engine and Connectors */
export class SessionManager {
  private sessions = new Map<string, Session>();

  /** Create a new session for a Connector */
  createSession(connectorId: string, connectorType: ConnectorType): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      connectorType,
      connectorId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Retrieve a session by ID */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /** List all active sessions */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /** Transfer a session to a different Connector */
  transferSession(
    sessionId: string,
    targetConnectorId: string,
    targetConnectorType?: ConnectorType,
  ): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.connectorId = targetConnectorId;
    if (targetConnectorType) {
      session.connectorType = targetConnectorType;
    }
    session.lastActiveAt = Date.now();
    return session;
  }

  /** Destroy a session */
  destroySession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** Touch a session to update lastActiveAt */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
    }
  }
}
