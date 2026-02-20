/** tRPC context — available in every procedure */
export interface EngineContext {
  /** Session ID from the Connector (if authenticated) */
  sessionId: string | null;
  /** Connector ID from the auth token */
  connectorId: string | null;
  /** Raw bearer token from the request */
  token: string | null;
}

/** Create context for each tRPC request */
export function createContext(): EngineContext {
  return {
    sessionId: null,
    connectorId: null,
    token: null,
  };
}
