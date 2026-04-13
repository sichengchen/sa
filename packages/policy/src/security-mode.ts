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
  trusted?: number;
  unrestricted?: number;
}

export interface SecurityModeConfig {
  defaultMode?: SecurityMode;
  modeTTL?: SecurityModeTTLConfig;
  allowUnrestrictedFromIM?: boolean;
}

const DEFAULT_TRUSTED_TTL = 3600;
const DEFAULT_UNRESTRICTED_TTL = 1800;

export class SecurityModeManager {
  private modes = new Map<string, SecurityModeState>();
  private config: SecurityModeConfig;

  constructor(config?: SecurityModeConfig) {
    this.config = config ?? {};
  }

  getMode(sessionId: string): SecurityMode {
    const state = this.modes.get(sessionId);
    if (!state) return this.config.defaultMode ?? "default";
    if (Date.now() > state.expiresAt) {
      this.modes.delete(sessionId);
      return this.config.defaultMode ?? "default";
    }
    return state.mode;
  }

  getModeState(sessionId: string): SecurityModeState | null {
    const state = this.modes.get(sessionId);
    if (!state) return null;
    if (Date.now() > state.expiresAt) {
      this.modes.delete(sessionId);
      return null;
    }
    return state;
  }

  setMode(
    sessionId: string,
    mode: SecurityMode,
    opts?: { isIM?: boolean },
  ): { ok: true; expiresAt: number } | { ok: false; error: string } {
    if (mode === "unrestricted" && opts?.isIM && !this.config.allowUnrestrictedFromIM) {
      return { ok: false, error: "Unrestricted mode is not allowed from IM connectors" };
    }

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

  getRemainingTTL(sessionId: string): number {
    const state = this.modes.get(sessionId);
    if (!state) return 0;
    const remaining = Math.max(0, state.expiresAt - Date.now());
    return Math.ceil(remaining / 1000);
  }

  clearMode(sessionId: string): void {
    this.modes.delete(sessionId);
  }

  private getTTL(mode: SecurityMode): number {
    if (mode === "trusted") return this.config.modeTTL?.trusted ?? DEFAULT_TRUSTED_TTL;
    if (mode === "unrestricted")
      return this.config.modeTTL?.unrestricted ?? DEFAULT_UNRESTRICTED_TTL;
    return 0;
  }
}

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
      "- Exec fence: widened to ~, deny only ~/.aria",
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
