import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getRuntimeHome } from "@aria/shared/brand.js";
import type { OperationalStore } from "./operational-store.js";

const TOKEN_BYTES = 32;
const DEFAULT_PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

/** Default TTLs in milliseconds */
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s cap */
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 60_000;

/** Timing-safe string comparison to prevent timing side-channel attacks */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export type TokenType = "master" | "session" | "webhook" | "pairing";

export interface TokenEntry {
  token: string;
  type: TokenType;
  connectorId: string;
  connectorType: string;
  pairedAt: number;
  /** TTL in ms — 0 means no expiry (engine lifetime) */
  ttl: number;
}

export interface AuthSecurityConfig {
  /** Session token TTL in seconds (default: 86400 = 24h) */
  sessionTTL?: number;
  /** Pairing code TTL in seconds (default: 600 = 10min) */
  pairingTTL?: number;
  /** Pairing code length (default: 8) */
  pairingCodeLength?: number;
}

/** Manages authentication tokens and device-flow pairing */
export class AuthManager {
  private masterToken: string = "";
  private webhookToken: string = "";
  private pairedTokens = new Map<string, TokenEntry>();
  private activePairingCode: string | null = null;
  private pairingCodeCreatedAt = 0;
  private tokenFilePath: string;
  private webhookTokenFilePath: string;
  private runtimeHome: string;

  /** Pairing rate limit state: per-connector exponential backoff */
  private pairingFailureCounts = new Map<string, number>();
  private pairingLockedUntil = new Map<string, number>();

  /** Security config */
  private sessionTTLMs: number;
  private pairingTTLMs: number;
  private pairingCodeLength: number;
  private store?: OperationalStore;

  constructor(runtimeHome?: string, securityConfig?: AuthSecurityConfig, store?: OperationalStore) {
    this.runtimeHome = runtimeHome ?? getRuntimeHome();
    this.tokenFilePath = join(this.runtimeHome, "engine.token");
    this.webhookTokenFilePath = join(this.runtimeHome, "engine.webhook-token");
    this.sessionTTLMs = (securityConfig?.sessionTTL ?? 86400) * 1000;
    this.pairingTTLMs = (securityConfig?.pairingTTL ?? 600) * 1000;
    this.pairingCodeLength = securityConfig?.pairingCodeLength ?? DEFAULT_PAIRING_CODE_LENGTH;
    this.store = store;
  }

  private hashCredential(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private issueSessionToken(connectorId: string, connectorType: string): string {
    const sessionToken = randomBytes(TOKEN_BYTES).toString("hex");
    const entry: TokenEntry = {
      token: sessionToken,
      type: "session",
      connectorId,
      connectorType,
      pairedAt: Date.now(),
      ttl: this.sessionTTLMs,
    };
    this.pairedTokens.set(sessionToken, entry);
    this.store?.upsertAuthSessionToken({
      tokenHash: this.hashCredential(sessionToken),
      connectorId,
      connectorType,
      pairedAt: entry.pairedAt,
      ttlMs: entry.ttl,
    });
    return sessionToken;
  }

  /** Generate and persist the master token + webhook token on Engine start */
  async init(): Promise<string> {
    this.masterToken = randomBytes(TOKEN_BYTES).toString("hex");
    this.webhookToken = randomBytes(TOKEN_BYTES).toString("hex");
    await writeFile(this.tokenFilePath, this.masterToken, { mode: 0o600 });
    await writeFile(this.webhookTokenFilePath, this.webhookToken, { mode: 0o600 });
    // Verify write succeeded — defense against race with old engine cleanup
    const written = readFileSync(this.tokenFilePath, "utf-8");
    if (written !== this.masterToken) {
      await writeFile(this.tokenFilePath, this.masterToken, { mode: 0o600 });
    }
    this.store?.pruneAuthState();
    return this.masterToken;
  }

  /** Clean up token files on shutdown */
  async cleanup(): Promise<void> {
    try { await unlink(this.tokenFilePath); } catch {}
    try { await unlink(this.webhookTokenFilePath); } catch {}
  }

  /** Get the master token (for local Connectors reading from file) */
  getMasterToken(): string {
    return this.masterToken;
  }

  /** Get the dedicated webhook token */
  getWebhookToken(): string {
    return this.webhookToken;
  }

  /** Generate a short pairing code for remote device-flow */
  generatePairingCode(): string {
    const bytes = randomBytes(this.pairingCodeLength);
    let code = "";
    for (let i = 0; i < this.pairingCodeLength; i++) {
      code += PAIRING_CODE_CHARSET[bytes[i]! % PAIRING_CODE_CHARSET.length];
    }
    const createdAt = Date.now();
    this.activePairingCode = code;
    this.pairingCodeCreatedAt = createdAt;
    this.store?.replacePairingCode({
      codeHash: this.hashCredential(code),
      createdAt,
      expiresAt: createdAt + this.pairingTTLMs,
    });
    return code;
  }

  /** Check if pairing code has expired */
  private isPairingCodeExpired(): boolean {
    if (!this.activePairingCode) return true;
    return Date.now() - this.pairingCodeCreatedAt > this.pairingTTLMs;
  }

  /** Attempt to pair with a code or master token. Returns a session token on success. */
  pair(
    credential: string,
    connectorId: string,
    connectorType: string,
  ): { success: boolean; token?: string; error?: string } {
    const now = Date.now();

    // Check per-connector rate limit (not for master token — local connectors should always work)
    const lockedUntil = this.pairingLockedUntil.get(connectorId) ?? 0;
    if (now < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - now) / 1000);
      return { success: false, error: `Too many failed pairing attempts. Try again in ${remaining}s.` };
    }

    // Master token (local connectors read from ~/.aria/engine.token)
    if (this.masterToken && safeCompare(credential, this.masterToken)) {
      return { success: true, token: this.issueSessionToken(connectorId, connectorType) };
    }

    const credentialHash = credential ? this.hashCredential(credential) : null;

    // Pairing code (remote device-flow)
    if (this.activePairingCode && safeCompare(credential, this.activePairingCode)) {
      if (this.isPairingCodeExpired()) {
        this.activePairingCode = null;
        if (credentialHash) {
          this.store?.consumePairingCode(credentialHash, now);
        }
        return { success: false, error: "Pairing code expired" };
      }
      this.activePairingCode = null; // one-time use
      this.pairingFailureCounts.delete(connectorId); // clear on success
      this.pairingLockedUntil.delete(connectorId);
      if (credentialHash) {
        this.store?.consumePairingCode(credentialHash, now);
      }
      return { success: true, token: this.issueSessionToken(connectorId, connectorType) };
    }

    if (credentialHash && this.store) {
      const pairingResult = this.store.consumePairingCode(credentialHash, now);
      if (pairingResult === "ok") {
        this.pairingFailureCounts.delete(connectorId);
        this.pairingLockedUntil.delete(connectorId);
        return { success: true, token: this.issueSessionToken(connectorId, connectorType) };
      }
      if (pairingResult === "expired") {
        return { success: false, error: "Pairing code expired" };
      }
    }

    // Track failure for exponential backoff (per-connector)
    const failures = (this.pairingFailureCounts.get(connectorId) ?? 0) + 1;
    this.pairingFailureCounts.set(connectorId, failures);
    const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, failures - 1), BACKOFF_CAP_MS);
    this.pairingLockedUntil.set(connectorId, now + backoffMs);

    if (this.activePairingCode && this.isPairingCodeExpired()) {
      return { success: false, error: "Pairing code expired" };
    }

    return { success: false };
  }

  /** Validate a bearer token. Returns connector info if valid. */
  validate(token: string): TokenEntry | null {
    // Master token is always valid (engine lifetime)
    if (this.masterToken && safeCompare(token, this.masterToken)) {
      return {
        token: this.masterToken,
        type: "master",
        connectorId: "master",
        connectorType: "local",
        pairedAt: 0,
        ttl: 0,
      };
    }

    // Webhook token
    if (this.webhookToken && safeCompare(token, this.webhookToken)) {
      return {
        token: this.webhookToken,
        type: "webhook",
        connectorId: "webhook",
        connectorType: "webhook",
        pairedAt: 0,
        ttl: 0,
      };
    }

    // Active pairing code (temporary)
    if (this.activePairingCode && safeCompare(token, this.activePairingCode)) {
      if (this.isPairingCodeExpired()) {
        this.activePairingCode = null;
        return null;
      }
      return {
        token: this.activePairingCode,
        type: "pairing",
        connectorId: "pairing",
        connectorType: "pairing",
        pairedAt: this.pairingCodeCreatedAt,
        ttl: this.pairingTTLMs,
      };
    }

    // Session tokens
    const existing = this.pairedTokens.get(token);
    if (existing) {
      if (existing.ttl > 0 && Date.now() - existing.pairedAt > existing.ttl) {
        this.pairedTokens.delete(token);
        this.store?.deleteAuthSessionToken(this.hashCredential(token));
        return null;
      }
      return existing;
    }

    const persisted = this.store?.getAuthSessionToken(this.hashCredential(token));
    if (!persisted) return null;

    const hydrated: TokenEntry = {
      token,
      type: "session",
      connectorId: persisted.connectorId,
      connectorType: persisted.connectorType,
      pairedAt: persisted.pairedAt,
      ttl: persisted.ttlMs,
    };
    this.pairedTokens.set(token, hydrated);
    return hydrated;
  }

  /** Validate a webhook bearer token specifically (not master token) */
  validateWebhookToken(token: string): boolean {
    if (!this.webhookToken) return false;
    return safeCompare(token, this.webhookToken);
  }

  /** Revoke a session token */
  revoke(token: string): boolean {
    const removedInMemory = this.pairedTokens.delete(token);
    const removedPersisted = this.store?.deleteAuthSessionToken(this.hashCredential(token)) ?? false;
    return removedInMemory || removedPersisted;
  }

  /** Read master token from file (used by Connectors) */
  static readTokenFromFile(runtimeHome?: string): string | null {
    const home = runtimeHome ?? getRuntimeHome();
    const path = join(home, "engine.token");
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8").trim();
  }
}
