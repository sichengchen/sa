import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { HANDOFF_SCHEMA_SQL } from "./schema.js";
import type { HandoffRecord } from "./types.js";

type Row = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function asOptionalText(value: unknown): string | null {
  return value == null ? null : asText(value);
}

function normalize(row: Row | null | undefined): HandoffRecord | undefined {
  if (!row) return undefined;
  return {
    handoffId: asText(row.handoff_id),
    idempotencyKey: asText(row.idempotency_key),
    sourceKind: asText(row.source_kind) as HandoffRecord["sourceKind"],
    sourceSessionId: asOptionalText(row.source_session_id),
    projectId: asText(row.project_id),
    taskId: asOptionalText(row.task_id),
    threadId: asOptionalText(row.thread_id),
    createdDispatchId: asOptionalText(row.created_dispatch_id),
    status: asText(row.status) as HandoffRecord["status"],
    payloadJson: asOptionalText(row.payload_json),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class HandoffStore {
  private db: Database | null = null;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    if (this.db) return;
    await mkdir(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(HANDOFF_SCHEMA_SQL);
  }

  close(): void {
    this.db?.close(false);
    this.db = null;
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error("Handoff store not initialized");
    }
    return this.db;
  }

  upsert(record: HandoffRecord): void {
    this.getDb()
      .prepare(`
      INSERT INTO projects_handoffs (
        handoff_id, idempotency_key, source_kind, source_session_id, project_id, task_id, thread_id,
        created_dispatch_id, status, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(handoff_id) DO UPDATE SET
        idempotency_key = excluded.idempotency_key,
        source_kind = excluded.source_kind,
        source_session_id = excluded.source_session_id,
        project_id = excluded.project_id,
        task_id = excluded.task_id,
        thread_id = excluded.thread_id,
        created_dispatch_id = excluded.created_dispatch_id,
        status = excluded.status,
        payload_json = excluded.payload_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `)
      .run(
        record.handoffId,
        record.idempotencyKey,
        record.sourceKind,
        record.sourceSessionId ?? null,
        record.projectId,
        record.taskId ?? null,
        record.threadId ?? null,
        record.createdDispatchId ?? null,
        record.status,
        record.payloadJson ?? null,
        record.createdAt,
        record.updatedAt,
      );
  }

  getByIdempotencyKey(idempotencyKey: string): HandoffRecord | undefined {
    return normalize(
      this.getDb()
        .prepare(`
      SELECT handoff_id, idempotency_key, source_kind, source_session_id, project_id, task_id, thread_id,
             created_dispatch_id, status, payload_json, created_at, updated_at
      FROM projects_handoffs
      WHERE idempotency_key = ?
    `)
        .get(idempotencyKey) as Row | undefined,
    );
  }

  getById(handoffId: string): HandoffRecord | undefined {
    return normalize(
      this.getDb()
        .prepare(`
      SELECT handoff_id, idempotency_key, source_kind, source_session_id, project_id, task_id, thread_id,
             created_dispatch_id, status, payload_json, created_at, updated_at
      FROM projects_handoffs
      WHERE handoff_id = ?
    `)
        .get(handoffId) as Row | undefined,
    );
  }

  list(projectId?: string): HandoffRecord[] {
    const rows = projectId
      ? (this.getDb()
          .prepare(`
          SELECT handoff_id, idempotency_key, source_kind, source_session_id, project_id, task_id, thread_id,
                 created_dispatch_id, status, payload_json, created_at, updated_at
          FROM projects_handoffs
          WHERE project_id = ?
          ORDER BY created_at DESC
        `)
          .all(projectId) as Row[])
      : (this.getDb()
          .prepare(`
          SELECT handoff_id, idempotency_key, source_kind, source_session_id, project_id, task_id, thread_id,
                 created_dispatch_id, status, payload_json, created_at, updated_at
          FROM projects_handoffs
          ORDER BY created_at DESC
        `)
          .all() as Row[]);

    return rows.map((row) => normalize(row)).filter((row): row is HandoffRecord => Boolean(row));
  }
}
