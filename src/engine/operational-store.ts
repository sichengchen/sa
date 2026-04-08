import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import type { Message } from "@mariozechner/pi-ai";
import type { Session } from "@sa/shared/types.js";

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ToolCallStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ApprovalStatus = "pending" | "approved" | "denied" | "allow_session" | "interrupted";

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

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_idx ON messages(session_id, message_index);
CREATE INDEX IF NOT EXISTS idx_runs_session_started ON runs(session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id, started_at ASC);
CREATE INDEX IF NOT EXISTS idx_approvals_session_created ON approvals(session_id, created_at DESC);
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
    this.dbPath = join(homeDir, "aria.sqlite");
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(SCHEMA_SQL);
    this.markInterruptedState();
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

    db.prepare(`
      UPDATE runs
      SET status = 'interrupted',
          completed_at = COALESCE(completed_at, ?),
          error_message = COALESCE(error_message, 'Runtime restarted before run completion')
      WHERE status = 'running'
    `).run(now);

    db.prepare(`
      UPDATE tool_calls
      SET status = 'interrupted',
          ended_at = COALESCE(ended_at, ?),
          is_error = 1,
          result_json = COALESCE(result_json, ?)
      WHERE status = 'running'
    `).run(
      now,
      JSON.stringify({
        content: "Runtime restarted before tool completion",
        isError: true,
      }),
    );

    db.prepare(`
      UPDATE approvals
      SET status = 'interrupted',
          resolved_at = COALESCE(resolved_at, ?),
          resolution = COALESCE(resolution, 'interrupted')
      WHERE status = 'pending'
    `).run(now);
  }

  upsertSession(session: Session): void {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO sessions (
        session_id, connector_type, connector_id, created_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        connector_type = excluded.connector_type,
        connector_id = excluded.connector_id,
        created_at = excluded.created_at,
        last_active_at = excluded.last_active_at
    `).run(
      session.id,
      session.connectorType,
      session.connectorId,
      session.createdAt,
      session.lastActiveAt,
    );
  }

  getSession(sessionId: string): Session | undefined {
    const row = this.getDb()
      .prepare(`
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE session_id = ?
      `)
      .get(sessionId) as Record<string, unknown> | undefined;

    return normalizeSessionRow(row);
  }

  listSessions(): Session[] {
    const rows = this.getDb()
      .prepare(`
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        ORDER BY last_active_at DESC, created_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => normalizeSessionRow(row)!).filter(Boolean);
  }

  listByPrefix(prefix: string): Session[] {
    const rows = this.getDb()
      .prepare(`
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE session_id LIKE ?
        ORDER BY last_active_at DESC, created_at DESC
      `)
      .all(`${prefix}:%`) as Array<Record<string, unknown>>;

    return rows.map((row) => normalizeSessionRow(row)!).filter(Boolean);
  }

  getLatest(prefix: string): Session | undefined {
    const row = this.getDb()
      .prepare(`
        SELECT session_id, connector_type, connector_id, created_at, last_active_at
        FROM sessions
        WHERE session_id LIKE ?
        ORDER BY last_active_at DESC, created_at DESC
        LIMIT 1
      `)
      .get(`${prefix}:%`) as Record<string, unknown> | undefined;

    return normalizeSessionRow(row);
  }

  destroySession(sessionId: string): boolean {
    const result = this.getDb()
      .prepare("DELETE FROM sessions WHERE session_id = ?")
      .run(sessionId);
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
      .prepare(`
        SELECT payload_json
        FROM messages
        WHERE session_id = ?
        ORDER BY message_index ASC
      `)
      .all(sessionId) as Array<{ payload_json: string }>;

    return rows.map((row) => JSON.parse(row.payload_json) as Message);
  }

  createRun(run: RunRecord): void {
    this.getDb()
      .prepare(`
        INSERT INTO runs (
          run_id, session_id, trigger, status, input_text, started_at,
          completed_at, stop_reason, error_message, parent_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
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
      .prepare(`
        UPDATE runs
        SET status = ?,
            completed_at = ?,
            stop_reason = ?,
            error_message = ?
        WHERE run_id = ?
          AND status = 'running'
      `)
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
      .prepare(`
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
      `)
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
      .prepare(`
        UPDATE tool_calls
        SET status = ?,
            ended_at = ?,
            result_json = ?,
            is_error = ?
        WHERE tool_call_id = ?
      `)
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
      .prepare(`
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
      `)
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
      .prepare(`
        UPDATE approvals
        SET status = ?,
            resolved_at = ?,
            resolution = ?
        WHERE approval_id = ?
          AND status = 'pending'
      `)
      .run(status, resolvedAt, status, approvalId);
  }
}
