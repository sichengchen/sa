import { randomBytes, timingSafeEqual } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TOKEN_BYTES = 32;
const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

/** Timing-safe string comparison to prevent timing side-channel attacks */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

interface TokenEntry {
  token: string;
  connectorId: string;
  connectorType: string;
  pairedAt: number;
}

/** Manages authentication tokens and device-flow pairing */
export class AuthManager {
  private masterToken: string = "";
  private pairedTokens = new Map<string, TokenEntry>();
  private activePairingCode: string | null = null;
  private tokenFilePath: string;

  constructor(saHome?: string) {
    const home = saHome ?? process.env.SA_HOME ?? join(homedir(), ".sa");
    this.tokenFilePath = join(home, "engine.token");
  }

  /** Generate and persist the master token on Engine start */
  async init(): Promise<string> {
    this.masterToken = randomBytes(TOKEN_BYTES).toString("hex");
    await writeFile(this.tokenFilePath, this.masterToken, { mode: 0o600 });
    return this.masterToken;
  }

  /** Clean up token file on shutdown */
  async cleanup(): Promise<void> {
    try { await unlink(this.tokenFilePath); } catch {}
  }

  /** Get the master token (for local Connectors reading from file) */
  getMasterToken(): string {
    return this.masterToken;
  }

  /** Generate a short pairing code for remote device-flow */
  generatePairingCode(): string {
    const bytes = randomBytes(PAIRING_CODE_LENGTH);
    let code = "";
    for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
      code += PAIRING_CODE_CHARSET[bytes[i]! % PAIRING_CODE_CHARSET.length];
    }
    this.activePairingCode = code;
    return code;
  }

  /** Attempt to pair with a code or master token. Returns a session token on success. */
  pair(
    credential: string,
    connectorId: string,
    connectorType: string,
  ): { success: boolean; token?: string } {
    // Master token (local Connectors read from ~/.sa/engine.token)
    if (this.masterToken && safeCompare(credential, this.masterToken)) {
      const sessionToken = randomBytes(TOKEN_BYTES).toString("hex");
      this.pairedTokens.set(sessionToken, {
        token: sessionToken,
        connectorId,
        connectorType,
        pairedAt: Date.now(),
      });
      return { success: true, token: sessionToken };
    }

    // Pairing code (remote device-flow)
    if (this.activePairingCode && safeCompare(credential, this.activePairingCode)) {
      this.activePairingCode = null; // one-time use
      const sessionToken = randomBytes(TOKEN_BYTES).toString("hex");
      this.pairedTokens.set(sessionToken, {
        token: sessionToken,
        connectorId,
        connectorType,
        pairedAt: Date.now(),
      });
      return { success: true, token: sessionToken };
    }

    return { success: false };
  }

  /** Validate a bearer token. Returns connector info if valid. */
  validate(token: string): TokenEntry | null {
    // Master token is always valid
    if (this.masterToken && safeCompare(token, this.masterToken)) {
      return {
        token: this.masterToken,
        connectorId: "master",
        connectorType: "local",
        pairedAt: 0,
      };
    }
    return this.pairedTokens.get(token) ?? null;
  }

  /** Revoke a session token */
  revoke(token: string): boolean {
    return this.pairedTokens.delete(token);
  }

  /** Read master token from file (used by Connectors) */
  static readTokenFromFile(saHome?: string): string | null {
    const home = saHome ?? process.env.SA_HOME ?? join(homedir(), ".sa");
    const path = join(home, "engine.token");
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8").trim();
  }
}
