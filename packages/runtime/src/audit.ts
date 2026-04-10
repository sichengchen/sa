/**
 * Append-only audit logger — NDJSON event log with rotation.
 *
 * This is a "hard" security layer: it cannot be disabled, even in
 * unrestricted session modes.
 */

import { appendFileSync, statSync, renameSync, existsSync, openSync, closeSync, chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DangerLevel } from "../../../src/engine/agent/types.js";

/** Event types recorded in the audit log */
export type AuditEvent =
  | "tool_call"
  | "tool_result"
  | "tool_approval"
  | "tool_denial"
  | "security_block"
  | "security_escalation"
  | "auth_success"
  | "auth_failure"
  | "mode_change"
  | "session_create"
  | "session_destroy"
  | "error";

/** A single audit log entry */
export interface AuditEntry {
  ts: string;
  session: string;
  connector: string;
  event: AuditEvent;
  run?: string;
  taskId?: string;
  taskRunId?: string;
  tool?: string;
  toolset?: string;
  backend?: string;
  danger?: DangerLevel;
  approval?: string;
  capabilityScope?: string;
  isolation?: string;
  mcpServer?: string;
  mcpTrust?: string;
  command?: string;
  url?: string;
  summary?: string;
  escalation?: {
    layer: string;
    choice: string;
    resource?: string;
  };
}

/** Fields the caller provides (ts is auto-set) */
export type AuditInput = Omit<AuditEntry, "ts">;

export interface AuditQueryOptions {
  tail?: number;
  tool?: string;
  event?: AuditEvent | string;
  since?: string;
  session?: string;
  run?: string;
  taskId?: string;
}

/** Max file size before rotation (10 MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Number of rotated generations to keep */
const MAX_GENERATIONS = 3;

/** Max summary length */
const MAX_SUMMARY_LENGTH = 200;

/** Truncate a session ID for readability (first 12 chars) */
function truncateSessionId(sessionId: string): string {
  if (sessionId.length <= 36) return sessionId;
  return sessionId.slice(0, 36);
}

/** Truncate summary to max length */
function truncateSummary(s: string): string {
  if (s.length <= MAX_SUMMARY_LENGTH) return s;
  return s.slice(0, MAX_SUMMARY_LENGTH) + "...";
}

function parseAuditLine(line: string): AuditEntry | null {
  try {
    return JSON.parse(line) as AuditEntry;
  } catch {
    return null;
  }
}

export function readAuditEntries(logPath: string): AuditEntry[] {
  if (!existsSync(logPath)) {
    return [];
  }

  const content = readFileSync(logPath, "utf-8").trim();
  if (!content) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => parseAuditLine(line))
    .filter((entry): entry is AuditEntry => entry !== null);
}

export function queryAuditEntries(logPath: string, options: AuditQueryOptions = {}): AuditEntry[] {
  let entries = readAuditEntries(logPath);

  if (options.tool) {
    entries = entries.filter((entry) => entry.tool === options.tool);
  }
  if (options.event) {
    entries = entries.filter((entry) => entry.event === options.event);
  }
  if (options.session) {
    const sessionFilter = options.session;
    entries = entries.filter((entry) => (
      entry.session.startsWith(sessionFilter) || sessionFilter.startsWith(entry.session)
    ));
  }
  if (options.run) {
    entries = entries.filter((entry) => entry.run === options.run);
  }
  if (options.taskId) {
    entries = entries.filter((entry) => entry.taskId === options.taskId);
  }
  if (options.since) {
    const sinceDate = new Date(options.since);
    if (!Number.isNaN(sinceDate.getTime())) {
      entries = entries.filter((entry) => new Date(entry.ts) >= sinceDate);
    }
  }

  const tail = options.tail ?? 20;
  if (entries.length > tail) {
    entries = entries.slice(-tail);
  }

  return entries;
}

export class AuditLogger {
  private logPath: string;

  constructor(logDir: string) {
    this.logPath = join(logDir, "audit.log");
    // Ensure the file exists with correct permissions
    if (!existsSync(this.logPath)) {
      const fd = openSync(this.logPath, "a");
      closeSync(fd);
      try {
        chmodSync(this.logPath, 0o600);
      } catch {
        // chmod may fail on some filesystems — non-fatal
      }
    }
  }

  /** Append an audit entry with auto-timestamp */
  log(input: AuditInput): void {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      session: truncateSessionId(input.session),
      connector: input.connector,
      event: input.event,
    };

    if (input.tool) entry.tool = input.tool;
    if (input.run) entry.run = input.run;
    if (input.taskId) entry.taskId = input.taskId;
    if (input.taskRunId) entry.taskRunId = input.taskRunId;
    if (input.toolset) entry.toolset = input.toolset;
    if (input.backend) entry.backend = input.backend;
    if (input.danger) entry.danger = input.danger;
    if (input.approval) entry.approval = input.approval;
    if (input.capabilityScope) entry.capabilityScope = input.capabilityScope;
    if (input.isolation) entry.isolation = input.isolation;
    if (input.mcpServer) entry.mcpServer = input.mcpServer;
    if (input.mcpTrust) entry.mcpTrust = input.mcpTrust;
    if (input.command) entry.command = input.command;
    if (input.url) entry.url = input.url;
    if (input.summary) entry.summary = truncateSummary(input.summary);
    if (input.escalation) entry.escalation = input.escalation;

    const line = JSON.stringify(entry) + "\n";

    try {
      this.maybeRotate();
      appendFileSync(this.logPath, line);
    } catch {
      // Audit write failure must not crash the engine
    }
  }

  /** Rotate log if it exceeds the size threshold */
  private maybeRotate(): void {
    try {
      const stat = statSync(this.logPath);
      if (stat.size < MAX_FILE_SIZE) return;
    } catch {
      return; // file doesn't exist yet — no rotation needed
    }

    // Rotate: audit.log.2 → audit.log.3, audit.log.1 → audit.log.2, audit.log → audit.log.1
    for (let i = MAX_GENERATIONS; i >= 1; i--) {
      const from = i === 1 ? this.logPath : `${this.logPath}.${i - 1}`;
      const to = `${this.logPath}.${i}`;
      try {
        if (existsSync(from)) {
          renameSync(from, to);
        }
      } catch {
        // Rotation failure is non-fatal
      }
    }

    // Re-create the log file
    try {
      const fd = openSync(this.logPath, "w");
      closeSync(fd);
      chmodSync(this.logPath, 0o600);
    } catch {
      // Non-fatal
    }
  }

  /** Get the log file path (for CLI reading) */
  getLogPath(): string {
    return this.logPath;
  }
}
