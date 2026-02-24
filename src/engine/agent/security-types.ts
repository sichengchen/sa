/**
 * Security escalation types — used when a security layer blocks a tool call
 * and the user can choose to override.
 */

/** Which security layer triggered the block */
export type SecurityLayer = "url_policy" | "exec_fence" | "tool_restriction";

/** Structured information about a security policy block */
export interface SecurityBlock {
  layer: SecurityLayer;
  detail: string;
  resource?: string;
}

/** How the user wants to handle a security block */
export type EscalationChoice = "allow_once" | "allow_session" | "add_persistent" | "deny";

/** Session-level security overrides (cleared on session destroy) */
export interface SessionSecurityOverrides {
  allowedUrls: Set<string>;
  allowedPaths: Set<string>;
  allowedTools: Set<string>;
}

/** Create empty security overrides */
export function createEmptyOverrides(): SessionSecurityOverrides {
  return {
    allowedUrls: new Set(),
    allowedPaths: new Set(),
    allowedTools: new Set(),
  };
}
