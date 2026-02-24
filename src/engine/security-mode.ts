/**
 * Session security mode manager — default/trusted/unrestricted.
 *
 * Hard layers (content framing, output redaction, audit log, env sanitization)
 * remain active in all modes.
 */

export type SecurityMode = "default" | "trusted" | "unrestricted";

export interface SecurityModeState {
  mode: SecurityMode;
  activatedAt: number;
  expiresAt: number;
  activatedBy: string;
}

export interface SecurityModeTTLConfig {
  /** Trusted mode TTL in seconds (default: 3600 = 1 hour) */
  trusted?: number;
  /** Unrestricted mode TTL in seconds (default: 1800 = 30 min) */
  unrestricted?: number;
}

export interface SecurityModeConfig {
  /** Default mode for new sessions (default: "default") */
  defaultMode?: SecurityMode;
  /** Auto-revert TTL per mode */
  modeTTL?: SecurityModeTTLConfig;
  /** Whether unrestricted mode can be activated from IM connectors (default: false) */
  allowUnrestrictedFromIM?: boolean;
}

const DEFAULT_TRUSTED_TTL = 3600; // 1 hour
const DEFAULT_UNRESTRICTED_TTL = 1800; // 30 min

export class SecurityModeManager {
  private modes = new Map<string, SecurityModeState>();
  private config: SecurityModeConfig;

  constructor(config?: SecurityModeConfig) {
    this.config = config ?? {};
  }

  /** Get the effective security mode for a session (checks expiry) */
  getMode(sessionId: string): SecurityMode {
    const state = this.modes.get(sessionId);
    if (!state) return this.config.defaultMode ?? "default";

    // Check expiry
    if (Date.now() > state.expiresAt) {
      this.modes.delete(sessionId);
      return this.config.defaultMode ?? "default";
    }

    return state.mode;
  }

  /** Get the full mode state for a session */
  getModeState(sessionId: string): SecurityModeState | null {
    const state = this.modes.get(sessionId);
    if (!state) return null;

    // Check expiry
    if (Date.now() > state.expiresAt) {
      this.modes.delete(sessionId);
      return null;
    }

    return state;
  }

  /** Set the security mode for a session */
  setMode(
    sessionId: string,
    mode: SecurityMode,
    opts?: { isIM?: boolean },
  ): { ok: true; expiresAt: number } | { ok: false; error: string } {
    // Unrestricted blocked from IM by default
    if (mode === "unrestricted" && opts?.isIM && !this.config.allowUnrestrictedFromIM) {
      return { ok: false, error: "Unrestricted mode is not allowed from IM connectors" };
    }

    // "default" just clears the mode
    if (mode === "default") {
      this.modes.delete(sessionId);
      return { ok: true, expiresAt: 0 };
    }

    const ttlSeconds = this.getTTL(mode);
    const now = Date.now();
    const state: SecurityModeState = {
      mode,
      activatedAt: now,
      expiresAt: now + ttlSeconds * 1000,
      activatedBy: sessionId,
    };
    this.modes.set(sessionId, state);
    return { ok: true, expiresAt: state.expiresAt };
  }

  /** Get remaining TTL in seconds for a session's current mode */
  getRemainingTTL(sessionId: string): number {
    const state = this.modes.get(sessionId);
    if (!state) return 0;
    const remaining = Math.max(0, state.expiresAt - Date.now());
    return Math.ceil(remaining / 1000);
  }

  /** Clear mode on session destroy */
  clearMode(sessionId: string): void {
    this.modes.delete(sessionId);
  }

  /** Get TTL in seconds for a given mode */
  private getTTL(mode: SecurityMode): number {
    if (mode === "trusted") {
      return this.config.modeTTL?.trusted ?? DEFAULT_TRUSTED_TTL;
    }
    if (mode === "unrestricted") {
      return this.config.modeTTL?.unrestricted ?? DEFAULT_UNRESTRICTED_TTL;
    }
    return 0;
  }
}

/** Describe what a mode enables (for user-facing messages) */
export function describeModeEffects(mode: SecurityMode, ttlSeconds: number): string {
  if (mode === "default") {
    return "Security mode: DEFAULT\n- All security layers active\n- All dangerous tools require approval";
  }

  const minutes = Math.ceil(ttlSeconds / 60);

  if (mode === "trusted") {
    return [
      "Switching to TRUSTED mode",
      "- Approval gate: only always-dangerous prompts",
      "- URL policy: localhost allowed",
      "- Exec fence: widened to ~, deny only ~/.sa",
      "- Content framing: still active",
      "- Audit log: still active",
      `Auto-reverts to default after ${minutes} minutes.`,
    ].join("\n");
  }

  return [
    "Switching to UNRESTRICTED mode",
    "- Approval gate: off",
    "- URL policy: off",
    "- Exec fence: off",
    "- Content framing: still active",
    "- Audit log: still active",
    `Auto-reverts to default after ${minutes} minutes.`,
  ].join("\n");
}
