import type { Database } from "bun:sqlite";

export const ARIA_DOMAIN_RELATIONS = [
  "server",
  "workspace",
  "project",
  "environment",
  "thread",
  "thread_environment_binding",
  "session",
  "run",
  "job",
  "automation",
  "memory_record",
  "connector_account",
  "approval",
  "audit_event",
  "checkpoint",
] as const;

function getRelationType(db: Database, relationName: string): "table" | "view" | undefined {
  const row = db.prepare(`SELECT type FROM sqlite_master WHERE name = ?`).get(relationName) as
    | { type?: string }
    | undefined;

  return row?.type === "table" || row?.type === "view" ? row.type : undefined;
}

function hasSourceTable(db: Database, tableName: string): boolean {
  return getRelationType(db, tableName) === "table";
}

function hasRelation(db: Database, relationName: string): boolean {
  return getRelationType(db, relationName) !== undefined;
}

function ensureView(
  db: Database,
  relationName: string,
  sourceTableName: string,
  selectSql: string,
): void {
  if (!hasSourceTable(db, sourceTableName) || hasRelation(db, relationName)) {
    return;
  }

  db.exec(`CREATE VIEW IF NOT EXISTS "${relationName}" AS ${selectSql}`);
}

function ensureTable(db: Database, relationName: string, columnsSql: string): void {
  if (hasRelation(db, relationName)) {
    return;
  }

  db.exec(`CREATE TABLE IF NOT EXISTS "${relationName}" (${columnsSql})`);
}

export function ensureAriaDomainModelSchema(db: Database): void {
  ensureView(
    db,
    "server",
    "projects_servers",
    `
    SELECT server_id, label, primary_base_url, secondary_base_url, created_at, updated_at
    FROM projects_servers
    `,
  );
  ensureView(
    db,
    "workspace",
    "projects_workspaces",
    `
    SELECT workspace_id, host, server_id, label, created_at, updated_at
    FROM projects_workspaces
    `,
  );
  ensureView(
    db,
    "project",
    "projects_projects",
    `
    SELECT project_id, name, slug, description, created_at, updated_at
    FROM projects_projects
    `,
  );
  ensureView(
    db,
    "environment",
    "projects_environments",
    `
    SELECT environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
    FROM projects_environments
    `,
  );
  ensureView(
    db,
    "thread",
    "projects_threads",
    `
    SELECT thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
           environment_id, environment_binding_id, agent_id, created_at, updated_at
    FROM projects_threads
    `,
  );
  ensureView(
    db,
    "thread_environment_binding",
    "projects_thread_environment_bindings",
    `
    SELECT binding_id, thread_id, project_id, workspace_id, environment_id, attached_at,
           detached_at, is_active, reason
    FROM projects_thread_environment_bindings
    `,
  );
  ensureView(
    db,
    "job",
    "projects_jobs",
    `
    SELECT job_id, thread_id, author, body, created_at
    FROM projects_jobs
    `,
  );
  ensureView(
    db,
    "session",
    "sessions",
    `
    SELECT session_id, connector_type, connector_id, created_at, last_active_at, destroyed_at,
           NULL AS thread_id,
           NULL AS thread_type,
           NULL AS workspace_id,
           NULL AS project_id,
           NULL AS environment_id,
           NULL AS agent_id
    FROM sessions
    `,
  );
  ensureView(
    db,
    "run",
    "runs",
    `
    SELECT run_id, session_id, trigger, status, input_text, started_at, completed_at,
           stop_reason, error_message, parent_run_id,
           NULL AS thread_id,
           NULL AS thread_type,
           NULL AS workspace_id,
           NULL AS project_id,
           NULL AS environment_id,
           NULL AS job_id,
           NULL AS agent_id
    FROM runs
    `,
  );
  ensureView(
    db,
    "approval",
    "approvals",
    `
    SELECT approval_id, run_id, session_id, tool_call_id, tool_name, args_json, status,
           created_at, resolved_at, resolution,
           NULL AS thread_id
    FROM approvals
    `,
  );
  ensureView(
    db,
    "automation",
    "automation_tasks",
    `
    SELECT task_id AS automation_id, task_type, name, slug, enabled, paused, config_json,
           created_at, updated_at, last_run_at, next_run_at, last_status, last_summary
    FROM automation_tasks
    `,
  );

  ensureTable(
    db,
    "memory_record",
    `
    memory_record_id TEXT PRIMARY KEY,
    thread_id TEXT,
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
    `,
  );
  ensureTable(
    db,
    "connector_account",
    `
    connector_account_id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
    `,
  );
  ensureTable(
    db,
    "audit_event",
    `
    audit_event_id TEXT PRIMARY KEY,
    thread_id TEXT,
    run_id TEXT,
    actor_id TEXT,
    kind TEXT NOT NULL,
    payload_json TEXT,
    created_at INTEGER NOT NULL
    `,
  );
  ensureTable(
    db,
    "checkpoint",
    `
    checkpoint_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    run_id TEXT,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL
    `,
  );
}

export function listAriaDomainRelations(db: Database): string[] {
  return [...ARIA_DOMAIN_RELATIONS].filter((relationName) => hasRelation(db, relationName));
}
