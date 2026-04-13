import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import type { Message } from "@mariozechner/pi-ai";
import type { Session } from "@aria/protocol";
import { ensureAriaDomainModelSchema } from "./domain-model.js";

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ToolCallStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ApprovalStatus = "pending" | "approved" | "denied" | "allow_session" | "interrupted";
export type AutomationTaskType = "heartbeat" | "cron" | "webhook";
export type AutomationRunStatus = "running" | "success" | "error" | "cancelled" | "interrupted";
export type AutomationDeliveryStatus = "not_requested" | "delivered" | "failed";

export interface RunRecord {
  runId: string;
  sessionId: string;
  trigger: string;
  status: RunStatus;
  inputText: string;
  startedAt: number;
  completedAt?: number | null;
  stopReason?: string | null;
  errorMessage?: string | null;
  parentRunId?: string | null;
}

export interface SessionSummaryRecord {
  sessionId: string;
  summaryKind: string;
  messageCount: number;
  summaryText: string;
  updatedAt: number;
}

export interface ApprovalRecord {
  approvalId: string;
  runId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: number;
  resolvedAt?: number | null;
  resolution?: string | null;
}

export interface PromptCacheRecord {
  cacheKey: string;
  scope: string;
  content: string;
  metadata?: Record<string, unknown>;
  updatedAt: number;
}

export interface AuthSessionTokenRecord {
  tokenHash: string;
  connectorId: string;
  connectorType: string;
  pairedAt: number;
  ttlMs: number;
}

export interface AutomationTaskRecord {
  taskId: string;
  taskType: AutomationTaskType;
  name: string;
  slug?: string | null;
  enabled: boolean;
  paused: boolean;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: AutomationRunStatus | null;
  lastSummary?: string | null;
}

export interface AutomationRunRecord {
  taskRunId: string;
  taskId: string;
  taskType: AutomationTaskType;
  taskName: string;
  sessionId?: string | null;
  runId?: string | null;
  trigger: string;
  status: AutomationRunStatus;
  promptText: string;
  responseText?: string | null;
  summary?: string | null;
  attemptNumber: number;
  maxAttempts: number;
  startedAt: number;
  completedAt?: number | null;
  deliveryTarget?: Record<string, unknown> | null;
  deliveryStatus: AutomationDeliveryStatus;
  deliveryAttemptedAt?: number | null;
  deliveryError?: string | null;
  errorMessage?: string | null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  destroyed_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  role TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(session_id, message_index)
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  input_text TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  stop_reason TEXT,
  error_message TEXT,
  parent_run_id TEXT
);

CREATE TABLE IF NOT EXISTS tool_calls (
  tool_call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  args_json TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  result_json TEXT,
  is_error INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL REFERENCES tool_calls(tool_call_id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS session_summaries (
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  summary_kind TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, summary_kind)
);

CREATE TABLE IF NOT EXISTS prompt_cache (
  cache_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_mcp_servers (
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  server_name TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, server_name)
);

CREATE TABLE IF NOT EXISTS auth_session_tokens (
  token_hash TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  paired_at INTEGER NOT NULL,
  ttl_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_pairing_codes (
  code_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS automation_tasks (
  task_id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  enabled INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_run_at TEXT,
  next_run_at TEXT,
  last_status TEXT,
  last_summary TEXT,
  UNIQUE(task_type, name),
  UNIQUE(task_type, slug)
);

CREATE TABLE IF NOT EXISTS automation_runs (
  task_run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES automation_tasks(task_id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  session_id TEXT,
  run_id TEXT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  response_text TEXT,
  summary TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  delivery_target_json TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'not_requested',
  delivery_attempted_at INTEGER,
  delivery_error TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_idx ON messages(session_id, message_index);
CREATE INDEX IF NOT EXISTS idx_runs_session_started ON runs(session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id, started_at ASC);
CREATE INDEX IF NOT EXISTS idx_approvals_session_created ON approvals(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_summaries_updated ON session_summaries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_cache_scope_updated ON prompt_cache(scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_mcp_servers_updated ON session_mcp_servers(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_session_tokens_paired ON auth_session_tokens(paired_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_pairing_codes_expires ON auth_pairing_codes(expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_tasks_type_name ON automation_tasks(task_type, name);
CREATE INDEX IF NOT EXISTS idx_automation_runs_task_started ON automation_runs(task_id, started_at DESC);
`;

function ensureTimestamp(value: unknown): number {
  return typeof value === "number" ? value : Date.now();
}

function normalizeSessionRow(row: Record<string, unknown> | null | undefined): Session | undefined {
  if (!row) return undefined;
  return {
    id: String(row.session_id),
    connectorType: String(row.connector_type),
    connectorId: String(row.connector_id),
    createdAt: Number(row.created_at),
    lastActiveAt: Number(row.last_active_at),
  };
}

export class OperationalStore {
  private readonly dbPath: string;
  private db: Database | null = null;

  constructor(homeDir: string) {
    this.dbPath = join(homeDir, "aria.db");
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(SCHEMA_SQL);
    ensureAriaDomainModelSchema(this.db);
    this.ensureColumn("sessions", "destroyed_at", "INTEGER");
    this.ensureColumn("automation_runs", "attempt_number", "INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn("automation_runs", "max_attempts", "INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn(
      "automation_runs",
      "delivery_status",
      "TEXT NOT NULL DEFAULT 'not_requested'",
    );
    this.ensureColumn("automation_runs", "delivery_attempted_at", "INTEGER");
    this.ensureColumn("automation_runs", "delivery_error", "TEXT");
    this.markInterruptedState();
    this.pruneAuthState();
  }

  close(): void {
    this.db?.close(false);
    this.db = null;
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error("Operational store not initialized");
    }
    return this.db;
  }

  private markInterruptedState(): void {
    const db = this.getDb();
    const now = Date.now();

    db.prepare(
      `
      UPDATE runs
      SET status = 'interrupted',
          completed_at = COALESCE(completed_at, ?),
          error_message = COALESCE(error_message, 'Runtime restarted before run completion')
      WHERE status = 'running'
    `,
    ).run(now);

    db.prepare(
      `
      UPDATE tool_calls
      SET status = 'interrupted',
          ended_at = COALESCE(ended_at, ?),
          is_error = 1,
          result_json = COALESCE(result_json, ?)
      WHERE status = 'running'
    `,
    ).run(
      now,
      JSON.stringify({
        content: "Runtime restarted before tool completion",
        isError: true,
      }),
    );

    db.prepare(
      `
      UPDATE approvals
      SET status = 'interrupted',
          resolved_at = COALESCE(resolved_at, ?),
          resolution = COALESCE(resolution, 'interrupted')
      WHERE status = 'pending'
    `,
    ).run(now);

    db.prepare(
      `
      UPDATE automation_runs
      SET status = 'interrupted',
          completed_at = COALESCE(completed_at, ?),
          error_message = COALESCE(error_message, 'Runtime restarted before automation run completion')
      WHERE status = 'running'
    `,
    ).run(now);
  }

  pruneAuthState(now = Date.now()): void {
    const db = this.getDb();
    db.prepare(
      `
      DELETE FROM auth_session_tokens
      WHERE ttl_ms > 0
        AND paired_at + ttl_ms <= ?
    `,
    ).run(now);
    db.prepare(
      `
      DELETE FROM auth_pairing_codes
      WHERE consumed_at IS NOT NULL
         OR expires_at <= ?
    `,
    ).run(now);
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const columns = this.getDb().prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    this.getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }

  upsertSession(session: Session): void {
    const db = this.getDb();
    db.prepare(
      `
      INSERT INTO sessions (
        session_id, connector_type, connector_id, created_at, last_active_at, destroyed_at
      ) VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(session_id) DO UPDATE SET
        connector_type = excluded.connector_type,
        connector_id = excluded.connector_id,
        created_at = excluded.created_at,
        last_active_at = excluded.last_active_at,
        destroyed_at = NULL
    `,
    ).run(
      session.id,
      session.connectorType,
      session.connectorId,
      session.createdAt,
      session.lastActiveAt,
    );
  }

  getSession(sessionId: string): Session | undefined {
    const row = this.getDb()
      .prepare(
        `
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE session_id = ?
          AND destroyed_at IS NULL
      `,
      )
      .get(sessionId) as Record<string, unknown> | undefined;

    return normalizeSessionRow(row);
  }

  listSessions(): Session[] {
    const rows = this.getDb()
      .prepare(
        `
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE destroyed_at IS NULL
        ORDER BY last_active_at DESC, created_at DESC
      `,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => normalizeSessionRow(row)!).filter(Boolean);
  }

  listByPrefix(prefix: string): Session[] {
    const rows = this.getDb()
      .prepare(
        `
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE session_id LIKE ?
          AND destroyed_at IS NULL
        ORDER BY last_active_at DESC, created_at DESC
      `,
      )
      .all(`${prefix}:%`) as Array<Record<string, unknown>>;

    return rows.map((row) => normalizeSessionRow(row)!).filter(Boolean);
  }

  getLatest(prefix: string): Session | undefined {
    const row = this.getDb()
      .prepare(
        `
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE session_id LIKE ?
          AND destroyed_at IS NULL
        ORDER BY last_active_at DESC, created_at DESC
        LIMIT 1
      `,
      )
      .get(`${prefix}:%`) as Record<string, unknown> | undefined;

    return normalizeSessionRow(row);
  }

  destroySession(sessionId: string): boolean {
    const result = this.getDb()
      .prepare(
        `
        UPDATE sessions
        SET destroyed_at = COALESCE(destroyed_at, ?)
        WHERE session_id = ?
          AND destroyed_at IS NULL
      `,
      )
      .run(Date.now(), sessionId);
    return result.changes > 0;
  }

  syncSessionMessages(sessionId: string, messages: readonly Message[]): void {
    const db = this.getDb();
    const deleteMessages = db.prepare("DELETE FROM messages WHERE session_id = ?");
    const insertMessage = db.prepare(`
      INSERT INTO messages (
        session_id, message_index, role, timestamp, payload_json
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      deleteMessages.run(sessionId);
      messages.forEach((message, index) => {
        insertMessage.run(
          sessionId,
          index,
          String(message.role),
          ensureTimestamp((message as { timestamp?: unknown }).timestamp),
          JSON.stringify(message),
        );
      });
    });

    tx();
  }

  getSessionMessages(sessionId: string): Message[] {
    const rows = this.getDb()
      .prepare(
        `
        SELECT payload_json
        FROM messages
        WHERE session_id = ?
        ORDER BY message_index ASC
      `,
      )
      .all(sessionId) as Array<{ payload_json: string }>;

    return rows.map((row) => JSON.parse(row.payload_json) as Message);
  }

  createRun(run: RunRecord): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO runs (
          run_id, session_id, trigger, status, input_text, started_at,
          completed_at, stop_reason, error_message, parent_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.runId,
        run.sessionId,
        run.trigger,
        run.status,
        run.inputText,
        run.startedAt,
        run.completedAt ?? null,
        run.stopReason ?? null,
        run.errorMessage ?? null,
        run.parentRunId ?? null,
      );
  }

  finishRun(
    runId: string,
    updates: {
      status: RunStatus;
      completedAt?: number;
      stopReason?: string | null;
      errorMessage?: string | null;
    },
  ): void {
    this.getDb()
      .prepare(
        `
        UPDATE runs
        SET status = ?,
            completed_at = ?,
            stop_reason = ?,
            error_message = ?
        WHERE run_id = ?
          AND status = 'running'
      `,
      )
      .run(
        updates.status,
        updates.completedAt ?? Date.now(),
        updates.stopReason ?? null,
        updates.errorMessage ?? null,
        runId,
      );
  }

  recordToolCallStart(input: {
    toolCallId: string;
    runId: string;
    sessionId: string;
    toolName: string;
    args: Record<string, unknown>;
    startedAt?: number;
  }): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO tool_calls (
          tool_call_id, run_id, session_id, tool_name, status, args_json, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tool_call_id) DO UPDATE SET
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          tool_name = excluded.tool_name,
          status = excluded.status,
          args_json = excluded.args_json,
          started_at = excluded.started_at
      `,
      )
      .run(
        input.toolCallId,
        input.runId,
        input.sessionId,
        input.toolName,
        "running",
        JSON.stringify(input.args),
        input.startedAt ?? Date.now(),
      );
  }

  recordToolCallEnd(input: {
    toolCallId: string;
    status: ToolCallStatus;
    result: { content: string; isError?: boolean };
    endedAt?: number;
  }): void {
    this.getDb()
      .prepare(
        `
        UPDATE tool_calls
        SET status = ?,
            ended_at = ?,
            result_json = ?,
            is_error = ?
        WHERE tool_call_id = ?
      `,
      )
      .run(
        input.status,
        input.endedAt ?? Date.now(),
        JSON.stringify(input.result),
        input.result.isError ? 1 : 0,
        input.toolCallId,
      );
  }

  recordApprovalPending(input: {
    approvalId: string;
    runId: string;
    sessionId: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    createdAt?: number;
  }): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO approvals (
          approval_id, run_id, session_id, tool_call_id, tool_name,
          args_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(approval_id) DO UPDATE SET
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          tool_call_id = excluded.tool_call_id,
          tool_name = excluded.tool_name,
          args_json = excluded.args_json,
          status = excluded.status,
          created_at = excluded.created_at,
          resolved_at = NULL,
          resolution = NULL
      `,
      )
      .run(
        input.approvalId,
        input.runId,
        input.sessionId,
        input.toolCallId,
        input.toolName,
        JSON.stringify(input.args),
        "pending",
        input.createdAt ?? Date.now(),
      );
  }

  resolveApproval(
    approvalId: string,
    status: Exclude<ApprovalStatus, "pending">,
    resolvedAt = Date.now(),
  ): void {
    this.getDb()
      .prepare(
        `
        UPDATE approvals
        SET status = ?,
            resolved_at = ?,
            resolution = ?
        WHERE approval_id = ?
          AND status = 'pending'
      `,
      )
      .run(status, resolvedAt, status, approvalId);
  }

  listApprovals(input?: {
    sessionId?: string;
    status?: ApprovalStatus;
    limit?: number;
  }): ApprovalRecord[] {
    const limit = input?.limit ?? 20;
    const filters: string[] = [];
    const params: Array<string | number> = [];

    if (input?.sessionId) {
      filters.push("session_id = ?");
      params.push(input.sessionId);
    }
    if (input?.status) {
      filters.push("status = ?");
      params.push(input.status);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = this.getDb()
      .prepare(
        `
        SELECT approval_id, run_id, session_id, tool_call_id, tool_name,
               args_json, status, created_at, resolved_at, resolution
        FROM approvals
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(...params, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      approvalId: String(row.approval_id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      toolCallId: String(row.tool_call_id),
      toolName: String(row.tool_name),
      args: JSON.parse(String(row.args_json)) as Record<string, unknown>,
      status: String(row.status) as ApprovalStatus,
      createdAt: Number(row.created_at),
      resolvedAt: row.resolved_at != null ? Number(row.resolved_at) : null,
      resolution: row.resolution != null ? String(row.resolution) : null,
    }));
  }

  getSessionSummary(sessionId: string, summaryKind: string): SessionSummaryRecord | undefined {
    const row = this.getDb()
      .prepare(
        `
        SELECT session_id, summary_kind, message_count, summary_text, updated_at
        FROM session_summaries
        WHERE session_id = ? AND summary_kind = ?
      `,
      )
      .get(sessionId, summaryKind) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return {
      sessionId: String(row.session_id),
      summaryKind: String(row.summary_kind),
      messageCount: Number(row.message_count),
      summaryText: String(row.summary_text),
      updatedAt: Number(row.updated_at),
    };
  }

  upsertSessionSummary(input: {
    sessionId: string;
    summaryKind: string;
    messageCount: number;
    summaryText: string;
    updatedAt?: number;
  }): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO session_summaries (
          session_id, summary_kind, message_count, summary_text, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, summary_kind) DO UPDATE SET
          message_count = excluded.message_count,
          summary_text = excluded.summary_text,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        input.sessionId,
        input.summaryKind,
        input.messageCount,
        input.summaryText,
        input.updatedAt ?? Date.now(),
      );
  }

  getPromptCache(cacheKey: string): PromptCacheRecord | undefined {
    const row = this.getDb()
      .prepare(
        `
        SELECT cache_key, scope, content, metadata_json, updated_at
        FROM prompt_cache
        WHERE cache_key = ?
      `,
      )
      .get(cacheKey) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return {
      cacheKey: String(row.cache_key),
      scope: String(row.scope),
      content: String(row.content),
      metadata:
        typeof row.metadata_json === "string" && row.metadata_json.length > 0
          ? JSON.parse(row.metadata_json)
          : undefined,
      updatedAt: Number(row.updated_at),
    };
  }

  putPromptCache(input: {
    cacheKey: string;
    scope: string;
    content: string;
    metadata?: Record<string, unknown>;
    updatedAt?: number;
  }): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO prompt_cache (
          cache_key, scope, content, metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          scope = excluded.scope,
          content = excluded.content,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        input.cacheKey,
        input.scope,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.updatedAt ?? Date.now(),
      );
  }

  upsertAuthSessionToken(input: {
    tokenHash: string;
    connectorId: string;
    connectorType: string;
    pairedAt?: number;
    ttlMs: number;
  }): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO auth_session_tokens (
          token_hash, connector_id, connector_type, paired_at, ttl_ms
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(token_hash) DO UPDATE SET
          connector_id = excluded.connector_id,
          connector_type = excluded.connector_type,
          paired_at = excluded.paired_at,
          ttl_ms = excluded.ttl_ms
      `,
      )
      .run(
        input.tokenHash,
        input.connectorId,
        input.connectorType,
        input.pairedAt ?? Date.now(),
        input.ttlMs,
      );
  }

  getAuthSessionToken(tokenHash: string, now = Date.now()): AuthSessionTokenRecord | undefined {
    const row = this.getDb()
      .prepare(
        `
        SELECT token_hash, connector_id, connector_type, paired_at, ttl_ms
        FROM auth_session_tokens
        WHERE token_hash = ?
      `,
      )
      .get(tokenHash) as Record<string, unknown> | undefined;

    if (!row) return undefined;

    const ttlMs = Number(row.ttl_ms);
    const pairedAt = Number(row.paired_at);
    if (ttlMs > 0 && pairedAt + ttlMs <= now) {
      this.deleteAuthSessionToken(tokenHash);
      return undefined;
    }

    return {
      tokenHash: String(row.token_hash),
      connectorId: String(row.connector_id),
      connectorType: String(row.connector_type),
      pairedAt,
      ttlMs,
    };
  }

  deleteAuthSessionToken(tokenHash: string): boolean {
    const result = this.getDb()
      .prepare("DELETE FROM auth_session_tokens WHERE token_hash = ?")
      .run(tokenHash);
    return result.changes > 0;
  }

  replacePairingCode(input: { codeHash: string; createdAt?: number; expiresAt: number }): void {
    const createdAt = input.createdAt ?? Date.now();
    const db = this.getDb();
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM auth_pairing_codes").run();
      db.prepare(
        `
        INSERT INTO auth_pairing_codes (
          code_hash, created_at, expires_at, consumed_at
        ) VALUES (?, ?, ?, NULL)
      `,
      ).run(input.codeHash, createdAt, input.expiresAt);
    });
    tx();
  }

  consumePairingCode(codeHash: string, now = Date.now()): "ok" | "expired" | "missing" {
    const row = this.getDb()
      .prepare(
        `
        SELECT code_hash, expires_at, consumed_at
        FROM auth_pairing_codes
        WHERE code_hash = ?
      `,
      )
      .get(codeHash) as Record<string, unknown> | undefined;

    if (!row) {
      return "missing";
    }

    if (row.consumed_at != null) {
      this.getDb().prepare("DELETE FROM auth_pairing_codes WHERE code_hash = ?").run(codeHash);
      return "missing";
    }

    if (Number(row.expires_at) <= now) {
      this.getDb().prepare("DELETE FROM auth_pairing_codes WHERE code_hash = ?").run(codeHash);
      return "expired";
    }

    this.getDb()
      .prepare(
        `
        UPDATE auth_pairing_codes
        SET consumed_at = ?
        WHERE code_hash = ?
          AND consumed_at IS NULL
      `,
      )
      .run(now, codeHash);
    this.pruneAuthState(now);
    return "ok";
  }

  getSessionMcpServerEnabled(sessionId: string, serverName: string): boolean | undefined {
    const row = this.getDb()
      .prepare(
        `
        SELECT enabled
        FROM session_mcp_servers
        WHERE session_id = ? AND server_name = ?
      `,
      )
      .get(sessionId, serverName) as { enabled: number } | undefined;

    if (!row) return undefined;
    return row.enabled === 1;
  }

  listSessionMcpServers(sessionId: string): Record<string, boolean> {
    const rows = this.getDb()
      .prepare(
        `
        SELECT server_name, enabled
        FROM session_mcp_servers
        WHERE session_id = ?
      `,
      )
      .all(sessionId) as Array<{ server_name: string; enabled: number }>;

    const result: Record<string, boolean> = {};
    for (const row of rows) {
      result[row.server_name] = row.enabled === 1;
    }
    return result;
  }

  setSessionMcpServerEnabled(
    sessionId: string,
    serverName: string,
    enabled: boolean,
    updatedAt = Date.now(),
  ): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO session_mcp_servers (
          session_id, server_name, enabled, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, server_name) DO UPDATE SET
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `,
      )
      .run(sessionId, serverName, enabled ? 1 : 0, updatedAt);
  }

  upsertAutomationTask(input: {
    taskId: string;
    taskType: AutomationTaskType;
    name: string;
    slug?: string | null;
    enabled: boolean;
    paused?: boolean;
    config: Record<string, unknown>;
    createdAt?: number;
    updatedAt?: number;
    lastRunAt?: string | null;
    nextRunAt?: string | null;
    lastStatus?: AutomationRunStatus | null;
    lastSummary?: string | null;
  }): void {
    const createdAt = input.createdAt ?? Date.now();
    const updatedAt = input.updatedAt ?? createdAt;
    this.getDb()
      .prepare(
        `
        INSERT INTO automation_tasks (
          task_id, task_type, name, slug, enabled, paused, config_json,
          created_at, updated_at, last_run_at, next_run_at, last_status, last_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          task_type = excluded.task_type,
          name = excluded.name,
          slug = excluded.slug,
          enabled = excluded.enabled,
          paused = excluded.paused,
          config_json = excluded.config_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          last_run_at = excluded.last_run_at,
          next_run_at = excluded.next_run_at,
          last_status = excluded.last_status,
          last_summary = excluded.last_summary
      `,
      )
      .run(
        input.taskId,
        input.taskType,
        input.name,
        input.slug ?? null,
        input.enabled ? 1 : 0,
        input.paused ? 1 : 0,
        JSON.stringify(input.config),
        createdAt,
        updatedAt,
        input.lastRunAt ?? null,
        input.nextRunAt ?? null,
        input.lastStatus ?? null,
        input.lastSummary ?? null,
      );
  }

  listAutomationTasks(taskType?: AutomationTaskType): AutomationTaskRecord[] {
    const rows = (
      taskType
        ? this.getDb()
            .prepare(
              `
          SELECT task_id, task_type, name, slug, enabled, paused, config_json,
                 created_at, updated_at, last_run_at, next_run_at, last_status, last_summary
          FROM automation_tasks
          WHERE task_type = ?
          ORDER BY task_type ASC, name ASC
        `,
            )
            .all(taskType)
        : this.getDb()
            .prepare(
              `
          SELECT task_id, task_type, name, slug, enabled, paused, config_json,
                 created_at, updated_at, last_run_at, next_run_at, last_status, last_summary
          FROM automation_tasks
          ORDER BY task_type ASC, name ASC
        `,
            )
            .all()
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      taskId: String(row.task_id),
      taskType: String(row.task_type) as AutomationTaskType,
      name: String(row.name),
      slug: row.slug != null ? String(row.slug) : null,
      enabled: Number(row.enabled) === 1,
      paused: Number(row.paused) === 1,
      config: JSON.parse(String(row.config_json)) as Record<string, unknown>,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      lastRunAt: row.last_run_at != null ? String(row.last_run_at) : null,
      nextRunAt: row.next_run_at != null ? String(row.next_run_at) : null,
      lastStatus: row.last_status != null ? (String(row.last_status) as AutomationRunStatus) : null,
      lastSummary: row.last_summary != null ? String(row.last_summary) : null,
    }));
  }

  getAutomationTaskByName(
    taskType: AutomationTaskType,
    name: string,
  ): AutomationTaskRecord | undefined {
    return this.listAutomationTasks(taskType).find((task) => task.name === name);
  }

  getAutomationTaskBySlug(slug: string): AutomationTaskRecord | undefined {
    return this.listAutomationTasks("webhook").find((task) => task.slug === slug);
  }

  deleteAutomationTask(taskId: string): boolean {
    const result = this.getDb()
      .prepare("DELETE FROM automation_tasks WHERE task_id = ?")
      .run(taskId);
    return result.changes > 0;
  }

  recordAutomationRunStart(input: {
    taskRunId: string;
    taskId: string;
    taskType: AutomationTaskType;
    taskName: string;
    sessionId?: string | null;
    runId?: string | null;
    trigger: string;
    promptText: string;
    deliveryTarget?: Record<string, unknown>;
    attemptNumber?: number;
    maxAttempts?: number;
    startedAt?: number;
  }): void {
    this.getDb()
      .prepare(
        `
        INSERT INTO automation_runs (
          task_run_id, task_id, task_type, task_name, session_id, run_id, trigger,
          status, prompt_text, response_text, summary, attempt_number, max_attempts,
          started_at, completed_at, delivery_target_json, delivery_status,
          delivery_attempted_at, delivery_error, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, 'not_requested', NULL, NULL, NULL)
      `,
      )
      .run(
        input.taskRunId,
        input.taskId,
        input.taskType,
        input.taskName,
        input.sessionId ?? null,
        input.runId ?? null,
        input.trigger,
        "running",
        input.promptText,
        input.attemptNumber ?? 1,
        input.maxAttempts ?? 1,
        input.startedAt ?? Date.now(),
        input.deliveryTarget ? JSON.stringify(input.deliveryTarget) : null,
      );
  }

  finishAutomationRun(input: {
    taskRunId: string;
    status: Exclude<AutomationRunStatus, "running">;
    responseText?: string | null;
    summary?: string | null;
    completedAt?: number;
    errorMessage?: string | null;
  }): void {
    this.getDb()
      .prepare(
        `
        UPDATE automation_runs
        SET status = ?,
            response_text = ?,
            summary = ?,
            completed_at = ?,
            error_message = ?
        WHERE task_run_id = ?
      `,
      )
      .run(
        input.status,
        input.responseText ?? null,
        input.summary ?? null,
        input.completedAt ?? Date.now(),
        input.errorMessage ?? null,
        input.taskRunId,
      );
  }

  recordAutomationDelivery(input: {
    taskRunId: string;
    deliveryStatus: AutomationDeliveryStatus;
    deliveryAttemptedAt?: number;
    deliveryError?: string | null;
  }): void {
    this.getDb()
      .prepare(
        `
        UPDATE automation_runs
        SET delivery_status = ?,
            delivery_attempted_at = ?,
            delivery_error = ?
        WHERE task_run_id = ?
      `,
      )
      .run(
        input.deliveryStatus,
        input.deliveryAttemptedAt ?? Date.now(),
        input.deliveryError ?? null,
        input.taskRunId,
      );
  }

  listAutomationRuns(taskId?: string, limit = 20): AutomationRunRecord[] {
    const rows = (
      taskId
        ? this.getDb()
            .prepare(
              `
          SELECT task_run_id, task_id, task_type, task_name, session_id, run_id, trigger,
                 status, prompt_text, response_text, summary, attempt_number, max_attempts,
                 started_at, completed_at, delivery_target_json, delivery_status,
                 delivery_attempted_at, delivery_error, error_message
          FROM automation_runs
          WHERE task_id = ?
          ORDER BY started_at DESC
          LIMIT ?
        `,
            )
            .all(taskId, limit)
        : this.getDb()
            .prepare(
              `
          SELECT task_run_id, task_id, task_type, task_name, session_id, run_id, trigger,
                 status, prompt_text, response_text, summary, attempt_number, max_attempts,
                 started_at, completed_at, delivery_target_json, delivery_status,
                 delivery_attempted_at, delivery_error, error_message
          FROM automation_runs
          ORDER BY started_at DESC
          LIMIT ?
        `,
            )
            .all(limit)
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      taskRunId: String(row.task_run_id),
      taskId: String(row.task_id),
      taskType: String(row.task_type) as AutomationTaskType,
      taskName: String(row.task_name),
      sessionId: row.session_id != null ? String(row.session_id) : null,
      runId: row.run_id != null ? String(row.run_id) : null,
      trigger: String(row.trigger),
      status: String(row.status) as AutomationRunStatus,
      promptText: String(row.prompt_text),
      responseText: row.response_text != null ? String(row.response_text) : null,
      summary: row.summary != null ? String(row.summary) : null,
      attemptNumber: Number(row.attempt_number ?? 1),
      maxAttempts: Number(row.max_attempts ?? 1),
      startedAt: Number(row.started_at),
      completedAt: row.completed_at != null ? Number(row.completed_at) : null,
      deliveryTarget:
        row.delivery_target_json != null
          ? (JSON.parse(String(row.delivery_target_json)) as Record<string, unknown>)
          : null,
      deliveryStatus: String(row.delivery_status ?? "not_requested") as AutomationDeliveryStatus,
      deliveryAttemptedAt:
        row.delivery_attempted_at != null ? Number(row.delivery_attempted_at) : null,
      deliveryError: row.delivery_error != null ? String(row.delivery_error) : null,
      errorMessage: row.error_message != null ? String(row.error_message) : null,
    }));
  }
}
