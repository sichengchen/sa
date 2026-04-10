/** tRPC context — available in every procedure */
export interface EngineContext {
  /** Session ID from the Connector (if authenticated) */
  sessionId: string | null;
  /** Connector ID from the auth token */
  connectorId: string | null;
  /** Connector type from the auth token */
  connectorType: string | null;
  /** Auth token type */
  tokenType: "master" | "session" | "webhook" | "pairing" | null;
  /** Raw bearer token from the request */
  token: string | null;
}

export interface CreateContextOptions {
  /** HTTP request (for fetch adapter) */
  req?: Request;
  /** Raw token override (for WS connections where token comes from query string) */
  rawToken?: string;
}

/** Create context for each tRPC request, extracting the bearer token if present */
export function createContext(opts?: CreateContextOptions): EngineContext {
  let token: string | null = null;

  if (opts?.rawToken) {
    token = opts.rawToken;
  } else if (opts?.req) {
    const authHeader = opts.req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  return {
    sessionId: null,
    connectorId: null,
    connectorType: null,
    tokenType: null,
    token,
  };
}
