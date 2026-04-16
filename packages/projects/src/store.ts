import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type { SQLQueryBindings } from "bun:sqlite";
import { ensureAriaDomainModelSchema } from "@aria/store";
import { PROJECTS_ENGINE_SCHEMA_SQL } from "./schema.js";
import type {
  DispatchRecord,
  ExternalRefRecord,
  JobRecord,
  ProjectRecord,
  PublishRunRecord,
  RepoRecord,
  ReviewRecord,
  ServerRecord,
  TaskRecord,
  ThreadRecord,
  ThreadEnvironmentBindingRecord,
  EnvironmentRecord,
  WorkspaceRecord,
  WorktreeRecord,
} from "./types.js";

type SqliteRow = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function asOptionalText(value: unknown): string | null {
  return value == null ? null : asText(value);
}

function normalizeProjectRow(row: SqliteRow | null | undefined): ProjectRecord | undefined {
  if (!row) return undefined;
  return {
    projectId: asText(row.project_id),
    name: asText(row.name),
    slug: asText(row.slug),
    description: asOptionalText(row.description),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeRepoRow(row: SqliteRow | null | undefined): RepoRecord | undefined {
  if (!row) return undefined;
  return {
    repoId: asText(row.repo_id),
    projectId: asText(row.project_id),
    name: asText(row.name),
    remoteUrl: asText(row.remote_url),
    defaultBranch: asText(row.default_branch),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeServerRow(row: SqliteRow | null | undefined): ServerRecord | undefined {
  if (!row) return undefined;
  return {
    serverId: asText(row.server_id),
    label: asText(row.label),
    primaryBaseUrl: asOptionalText(row.primary_base_url),
    secondaryBaseUrl: asOptionalText(row.secondary_base_url),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeWorkspaceRow(row: SqliteRow | null | undefined): WorkspaceRecord | undefined {
  if (!row) return undefined;
  return {
    workspaceId: asText(row.workspace_id),
    host: asText(row.host) as WorkspaceRecord["host"],
    serverId: asOptionalText(row.server_id),
    label: asText(row.label),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeEnvironmentRow(row: SqliteRow | null | undefined): EnvironmentRecord | undefined {
  if (!row) return undefined;
  return {
    environmentId: asText(row.environment_id),
    workspaceId: asText(row.workspace_id),
    projectId: asText(row.project_id),
    label: asText(row.label),
    mode: asText(row.mode) as EnvironmentRecord["mode"],
    kind: asText(row.kind) as EnvironmentRecord["kind"],
    locator: asText(row.locator),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeTaskRow(row: SqliteRow | null | undefined): TaskRecord | undefined {
  if (!row) return undefined;
  return {
    taskId: asText(row.task_id),
    projectId: asText(row.project_id),
    repoId: asOptionalText(row.repo_id),
    title: asText(row.title),
    description: asOptionalText(row.description),
    status: asText(row.status) as TaskRecord["status"],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeThreadRow(row: SqliteRow | null | undefined): ThreadRecord | undefined {
  if (!row) return undefined;
  return {
    threadId: asText(row.thread_id),
    projectId: asText(row.project_id),
    taskId: asOptionalText(row.task_id),
    repoId: asOptionalText(row.repo_id),
    title: asText(row.title),
    status: asText(row.status) as ThreadRecord["status"],
    threadType: asOptionalText(row.thread_type) as ThreadRecord["threadType"],
    workspaceId: asOptionalText(row.workspace_id),
    environmentId: asOptionalText(row.environment_id),
    environmentBindingId: asOptionalText(row.environment_binding_id),
    agentId: asOptionalText(row.agent_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeThreadEnvironmentBindingRow(
  row: SqliteRow | null | undefined,
): ThreadEnvironmentBindingRecord | undefined {
  if (!row) return undefined;
  return {
    bindingId: asText(row.binding_id),
    threadId: asText(row.thread_id),
    projectId: asText(row.project_id),
    workspaceId: asText(row.workspace_id),
    environmentId: asText(row.environment_id),
    attachedAt: Number(row.attached_at),
    detachedAt: row.detached_at == null ? null : Number(row.detached_at),
    isActive: Boolean(row.is_active),
    reason: asOptionalText(row.reason),
  };
}

function hasColumn(db: Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name?: string;
  }>;
  return rows.some((row) => row.name === columnName);
}

function ensureProjectsStoreSchema(db: Database): void {
  const threadColumns = [
    ["thread_type", "TEXT"],
    ["workspace_id", "TEXT"],
    ["environment_id", "TEXT"],
    ["environment_binding_id", "TEXT"],
    ["agent_id", "TEXT"],
  ] as const;

  for (const [columnName, columnType] of threadColumns) {
    if (!hasColumn(db, "projects_threads", columnName)) {
      db.exec(`ALTER TABLE projects_threads ADD COLUMN ${columnName} ${columnType}`);
    }
  }
}

function normalizeJobRow(row: SqliteRow | null | undefined): JobRecord | undefined {
  if (!row) return undefined;
  return {
    jobId: asText(row.job_id),
    threadId: asText(row.thread_id),
    author: asText(row.author) as JobRecord["author"],
    body: asText(row.body),
    createdAt: Number(row.created_at),
  };
}

function normalizeExternalRefRow(row: SqliteRow | null | undefined): ExternalRefRecord | undefined {
  if (!row) return undefined;
  return {
    externalRefId: asText(row.external_ref_id),
    ownerType: asText(row.owner_type) as ExternalRefRecord["ownerType"],
    ownerId: asText(row.owner_id),
    system: asText(row.system) as ExternalRefRecord["system"],
    externalId: asText(row.external_id),
    externalKey: asOptionalText(row.external_key),
    sessionId: asOptionalText(row.session_id),
    metadataJson: asOptionalText(row.metadata_json),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeDispatchRow(row: SqliteRow | null | undefined): DispatchRecord | undefined {
  if (!row) return undefined;
  return {
    dispatchId: asText(row.dispatch_id),
    projectId: asText(row.project_id),
    taskId: asOptionalText(row.task_id),
    threadId: asText(row.thread_id),
    jobId: asOptionalText(row.job_id),
    repoId: asOptionalText(row.repo_id),
    worktreeId: asOptionalText(row.worktree_id),
    status: asText(row.status) as DispatchRecord["status"],
    requestedBackend: asOptionalText(row.requested_backend),
    requestedModel: asOptionalText(row.requested_model),
    executionSessionId: asOptionalText(row.execution_session_id),
    summary: asOptionalText(row.summary),
    error: asOptionalText(row.error),
    createdAt: Number(row.created_at),
    acceptedAt: row.accepted_at == null ? null : Number(row.accepted_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
  };
}

function normalizeWorktreeRow(row: SqliteRow | null | undefined): WorktreeRecord | undefined {
  if (!row) return undefined;
  return {
    worktreeId: asText(row.worktree_id),
    repoId: asText(row.repo_id),
    threadId: asOptionalText(row.thread_id),
    dispatchId: asOptionalText(row.dispatch_id),
    path: asText(row.path),
    branchName: asText(row.branch_name),
    baseRef: asText(row.base_ref),
    status: asText(row.status) as WorktreeRecord["status"],
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    prunedAt: row.pruned_at == null ? null : Number(row.pruned_at),
  };
}

function normalizeReviewRow(row: SqliteRow | null | undefined): ReviewRecord | undefined {
  if (!row) return undefined;
  return {
    reviewId: asText(row.review_id),
    dispatchId: asText(row.dispatch_id),
    threadId: asText(row.thread_id),
    reviewType: asText(row.review_type) as ReviewRecord["reviewType"],
    status: asText(row.status) as ReviewRecord["status"],
    summary: asOptionalText(row.summary),
    artifactJson: asOptionalText(row.artifact_json),
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at == null ? null : Number(row.resolved_at),
  };
}

function normalizePublishRunRow(row: SqliteRow | null | undefined): PublishRunRecord | undefined {
  if (!row) return undefined;
  return {
    publishRunId: asText(row.publish_run_id),
    dispatchId: asText(row.dispatch_id),
    threadId: asText(row.thread_id),
    repoId: asText(row.repo_id),
    branchName: asText(row.branch_name),
    remoteName: asText(row.remote_name),
    status: asText(row.status) as PublishRunRecord["status"],
    commitSha: asOptionalText(row.commit_sha),
    prUrl: asOptionalText(row.pr_url),
    metadataJson: asOptionalText(row.metadata_json),
    createdAt: Number(row.created_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
  };
}

export class ProjectsEngineStore {
  private readonly dbPath: string;
  private db: Database | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    if (this.db) return;

    await mkdir(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(PROJECTS_ENGINE_SCHEMA_SQL);
    ensureProjectsStoreSchema(this.db);
    ensureAriaDomainModelSchema(this.db);
  }

  close(): void {
    this.db?.close(false);
    this.db = null;
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error("Projects engine store not initialized");
    }
    return this.db;
  }

  private all<T>(sql: string, ...params: SQLQueryBindings[]): T[] {
    return this.getDb()
      .prepare(sql)
      .all(...params) as T[];
  }

  private get<T>(sql: string, ...params: SQLQueryBindings[]): T | undefined {
    return this.getDb()
      .prepare(sql)
      .get(...params) as T | undefined;
  }

  private run(sql: string, ...params: SQLQueryBindings[]): void {
    this.getDb()
      .prepare(sql)
      .run(...params);
  }

  upsertProject(project: ProjectRecord): void {
    this.run(
      `
      INSERT INTO projects_projects (
        project_id, name, slug, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        slug = excluded.slug,
        description = excluded.description,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      project.projectId,
      project.name,
      project.slug,
      project.description ?? null,
      project.createdAt,
      project.updatedAt,
    );
  }

  listProjects(): ProjectRecord[] {
    return this.all<SqliteRow>(
      `
      SELECT project_id, name, slug, description, created_at, updated_at
      FROM projects_projects
      ORDER BY updated_at DESC, created_at DESC
      `,
    )
      .map((row) => normalizeProjectRow(row))
      .filter((row): row is ProjectRecord => Boolean(row));
  }

  getProject(projectId: string): ProjectRecord | undefined {
    return normalizeProjectRow(
      this.get<SqliteRow>(
        `
        SELECT project_id, name, slug, description, created_at, updated_at
        FROM projects_projects
        WHERE project_id = ?
        `,
        projectId,
      ),
    );
  }

  upsertServer(server: ServerRecord): void {
    this.run(
      `
      INSERT INTO projects_servers (
        server_id, label, primary_base_url, secondary_base_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id) DO UPDATE SET
        label = excluded.label,
        primary_base_url = excluded.primary_base_url,
        secondary_base_url = excluded.secondary_base_url,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      server.serverId,
      server.label,
      server.primaryBaseUrl ?? null,
      server.secondaryBaseUrl ?? null,
      server.createdAt,
      server.updatedAt,
    );
  }

  listServers(): ServerRecord[] {
    return this.all<SqliteRow>(
      `
      SELECT server_id, label, primary_base_url, secondary_base_url, created_at, updated_at
      FROM projects_servers
      ORDER BY updated_at DESC, created_at DESC
      `,
    )
      .map((row) => normalizeServerRow(row))
      .filter((row): row is ServerRecord => Boolean(row));
  }

  getServer(serverId: string): ServerRecord | undefined {
    return normalizeServerRow(
      this.get<SqliteRow>(
        `
        SELECT server_id, label, primary_base_url, secondary_base_url, created_at, updated_at
        FROM projects_servers
        WHERE server_id = ?
        `,
        serverId,
      ),
    );
  }

  upsertWorkspace(workspace: WorkspaceRecord): void {
    this.run(
      `
      INSERT INTO projects_workspaces (
        workspace_id, host, server_id, label, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        host = excluded.host,
        server_id = excluded.server_id,
        label = excluded.label,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      workspace.workspaceId,
      workspace.host,
      workspace.serverId ?? null,
      workspace.label,
      workspace.createdAt,
      workspace.updatedAt,
    );
  }

  listWorkspaces(serverId?: string): WorkspaceRecord[] {
    const rows = serverId
      ? this.all<SqliteRow>(
          `
          SELECT workspace_id, host, server_id, label, created_at, updated_at
          FROM projects_workspaces
          WHERE server_id = ?
          ORDER BY updated_at DESC, created_at DESC
          `,
          serverId,
        )
      : this.all<SqliteRow>(
          `
          SELECT workspace_id, host, server_id, label, created_at, updated_at
          FROM projects_workspaces
          ORDER BY updated_at DESC, created_at DESC
          `,
        );

    return rows
      .map((row) => normalizeWorkspaceRow(row))
      .filter((row): row is WorkspaceRecord => Boolean(row));
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | undefined {
    return normalizeWorkspaceRow(
      this.get<SqliteRow>(
        `
        SELECT workspace_id, host, server_id, label, created_at, updated_at
        FROM projects_workspaces
        WHERE workspace_id = ?
        `,
        workspaceId,
      ),
    );
  }

  upsertEnvironment(environment: EnvironmentRecord): void {
    this.run(
      `
      INSERT INTO projects_environments (
        environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(environment_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        project_id = excluded.project_id,
        label = excluded.label,
        mode = excluded.mode,
        kind = excluded.kind,
        locator = excluded.locator,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      environment.environmentId,
      environment.workspaceId,
      environment.projectId,
      environment.label,
      environment.mode,
      environment.kind,
      environment.locator,
      environment.createdAt,
      environment.updatedAt,
    );
  }

  listEnvironments(projectId?: string, workspaceId?: string): EnvironmentRecord[] {
    let rows: SqliteRow[];
    if (projectId && workspaceId) {
      rows = this.all<SqliteRow>(
        `
        SELECT environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
        FROM projects_environments
        WHERE project_id = ? AND workspace_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        projectId,
        workspaceId,
      );
    } else if (projectId) {
      rows = this.all<SqliteRow>(
        `
        SELECT environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
        FROM projects_environments
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        projectId,
      );
    } else if (workspaceId) {
      rows = this.all<SqliteRow>(
        `
        SELECT environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
        FROM projects_environments
        WHERE workspace_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        workspaceId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
        FROM projects_environments
        ORDER BY updated_at DESC, created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeEnvironmentRow(row))
      .filter((row): row is EnvironmentRecord => Boolean(row));
  }

  getEnvironment(environmentId: string): EnvironmentRecord | undefined {
    return normalizeEnvironmentRow(
      this.get<SqliteRow>(
        `
        SELECT environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
        FROM projects_environments
        WHERE environment_id = ?
        `,
        environmentId,
      ),
    );
  }

  upsertRepo(repo: RepoRecord): void {
    this.run(
      `
      INSERT INTO projects_repos (
        repo_id, project_id, name, remote_url, default_branch, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        remote_url = excluded.remote_url,
        default_branch = excluded.default_branch,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      repo.repoId,
      repo.projectId,
      repo.name,
      repo.remoteUrl,
      repo.defaultBranch,
      repo.createdAt,
      repo.updatedAt,
    );
  }

  listRepos(projectId?: string): RepoRecord[] {
    const rows = projectId
      ? this.all<SqliteRow>(
          `
          SELECT repo_id, project_id, name, remote_url, default_branch, created_at, updated_at
          FROM projects_repos
          WHERE project_id = ?
          ORDER BY updated_at DESC, created_at DESC
          `,
          projectId,
        )
      : this.all<SqliteRow>(
          `
          SELECT repo_id, project_id, name, remote_url, default_branch, created_at, updated_at
          FROM projects_repos
          ORDER BY updated_at DESC, created_at DESC
          `,
        );

    return rows
      .map((row) => normalizeRepoRow(row))
      .filter((row): row is RepoRecord => Boolean(row));
  }

  getRepo(repoId: string): RepoRecord | undefined {
    return normalizeRepoRow(
      this.get<SqliteRow>(
        `
        SELECT repo_id, project_id, name, remote_url, default_branch, created_at, updated_at
        FROM projects_repos
        WHERE repo_id = ?
        `,
        repoId,
      ),
    );
  }

  upsertTask(task: TaskRecord): void {
    this.run(
      `
      INSERT INTO projects_tasks (
        task_id, project_id, repo_id, title, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        project_id = excluded.project_id,
        repo_id = excluded.repo_id,
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      task.taskId,
      task.projectId,
      task.repoId ?? null,
      task.title,
      task.description ?? null,
      task.status,
      task.createdAt,
      task.updatedAt,
    );
  }

  listTasks(projectId?: string, repoId?: string): TaskRecord[] {
    let rows: SqliteRow[];
    if (projectId && repoId) {
      rows = this.all<SqliteRow>(
        `
        SELECT task_id, project_id, repo_id, title, description, status, created_at, updated_at
        FROM projects_tasks
        WHERE project_id = ? AND repo_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        projectId,
        repoId,
      );
    } else if (projectId) {
      rows = this.all<SqliteRow>(
        `
        SELECT task_id, project_id, repo_id, title, description, status, created_at, updated_at
        FROM projects_tasks
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        projectId,
      );
    } else if (repoId) {
      rows = this.all<SqliteRow>(
        `
        SELECT task_id, project_id, repo_id, title, description, status, created_at, updated_at
        FROM projects_tasks
        WHERE repo_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        repoId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT task_id, project_id, repo_id, title, description, status, created_at, updated_at
        FROM projects_tasks
        ORDER BY updated_at DESC, created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeTaskRow(row))
      .filter((row): row is TaskRecord => Boolean(row));
  }

  getTask(taskId: string): TaskRecord | undefined {
    return normalizeTaskRow(
      this.get<SqliteRow>(
        `
        SELECT task_id, project_id, repo_id, title, description, status, created_at, updated_at
        FROM projects_tasks
        WHERE task_id = ?
        `,
        taskId,
      ),
    );
  }

  upsertThread(thread: ThreadRecord): void {
    this.run(
      `
      INSERT INTO projects_threads (
        thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
        environment_id, environment_binding_id, agent_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET
        project_id = excluded.project_id,
        task_id = excluded.task_id,
        repo_id = excluded.repo_id,
        title = excluded.title,
        status = excluded.status,
        thread_type = excluded.thread_type,
        workspace_id = excluded.workspace_id,
        environment_id = excluded.environment_id,
        environment_binding_id = excluded.environment_binding_id,
        agent_id = excluded.agent_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      thread.threadId,
      thread.projectId,
      thread.taskId ?? null,
      thread.repoId ?? null,
      thread.title,
      thread.status,
      thread.threadType ?? null,
      thread.workspaceId ?? null,
      thread.environmentId ?? null,
      thread.environmentBindingId ?? null,
      thread.agentId ?? null,
      thread.createdAt,
      thread.updatedAt,
    );
  }

  listThreads(projectId?: string, taskId?: string): ThreadRecord[] {
    let rows: SqliteRow[];
    if (projectId && taskId) {
      rows = this.all<SqliteRow>(
        `
        SELECT thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
               environment_id, environment_binding_id, agent_id, created_at, updated_at
        FROM projects_threads
        WHERE project_id = ? AND task_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        projectId,
        taskId,
      );
    } else if (projectId) {
      rows = this.all<SqliteRow>(
        `
        SELECT thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
               environment_id, environment_binding_id, agent_id, created_at, updated_at
        FROM projects_threads
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        projectId,
      );
    } else if (taskId) {
      rows = this.all<SqliteRow>(
        `
        SELECT thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
               environment_id, environment_binding_id, agent_id, created_at, updated_at
        FROM projects_threads
        WHERE task_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        taskId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
               environment_id, environment_binding_id, agent_id, created_at, updated_at
        FROM projects_threads
        ORDER BY updated_at DESC, created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeThreadRow(row))
      .filter((row): row is ThreadRecord => Boolean(row));
  }

  getThread(threadId: string): ThreadRecord | undefined {
    return normalizeThreadRow(
      this.get<SqliteRow>(
        `
        SELECT thread_id, project_id, task_id, repo_id, title, status, thread_type, workspace_id,
               environment_id, environment_binding_id, agent_id, created_at, updated_at
        FROM projects_threads
        WHERE thread_id = ?
        `,
        threadId,
      ),
    );
  }

  upsertThreadEnvironmentBinding(binding: ThreadEnvironmentBindingRecord): void {
    if (binding.isActive) {
      this.run(
        `
        UPDATE projects_thread_environment_bindings
        SET is_active = 0, detached_at = COALESCE(detached_at, ?)
        WHERE thread_id = ? AND binding_id != ? AND is_active = 1
        `,
        binding.attachedAt,
        binding.threadId,
        binding.bindingId,
      );

      this.run(
        `
        UPDATE projects_threads
        SET workspace_id = ?, environment_id = ?, environment_binding_id = ?, updated_at = MAX(updated_at, ?)
        WHERE thread_id = ?
        `,
        binding.workspaceId,
        binding.environmentId,
        binding.bindingId,
        binding.attachedAt,
        binding.threadId,
      );
    }

    this.run(
      `
      INSERT INTO projects_thread_environment_bindings (
        binding_id, thread_id, project_id, workspace_id, environment_id, attached_at,
        detached_at, is_active, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(binding_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        project_id = excluded.project_id,
        workspace_id = excluded.workspace_id,
        environment_id = excluded.environment_id,
        attached_at = excluded.attached_at,
        detached_at = excluded.detached_at,
        is_active = excluded.is_active,
        reason = excluded.reason
      `,
      binding.bindingId,
      binding.threadId,
      binding.projectId,
      binding.workspaceId,
      binding.environmentId,
      binding.attachedAt,
      binding.detachedAt ?? null,
      binding.isActive ? 1 : 0,
      binding.reason ?? null,
    );
  }

  listThreadEnvironmentBindings(threadId?: string): ThreadEnvironmentBindingRecord[] {
    const rows = threadId
      ? this.all<SqliteRow>(
          `
          SELECT binding_id, thread_id, project_id, workspace_id, environment_id, attached_at,
                 detached_at, is_active, reason
          FROM projects_thread_environment_bindings
          WHERE thread_id = ?
          ORDER BY attached_at DESC, is_active DESC, binding_id DESC
          `,
          threadId,
        )
      : this.all<SqliteRow>(
          `
          SELECT binding_id, thread_id, project_id, workspace_id, environment_id, attached_at,
                 detached_at, is_active, reason
          FROM projects_thread_environment_bindings
          ORDER BY attached_at DESC, is_active DESC, binding_id DESC
          `,
        );

    return rows
      .map((row) => normalizeThreadEnvironmentBindingRow(row))
      .filter((row): row is ThreadEnvironmentBindingRecord => Boolean(row));
  }

  getActiveThreadEnvironmentBinding(threadId: string): ThreadEnvironmentBindingRecord | undefined {
    return normalizeThreadEnvironmentBindingRow(
      this.get<SqliteRow>(
        `
        SELECT binding_id, thread_id, project_id, workspace_id, environment_id, attached_at,
               detached_at, is_active, reason
        FROM projects_thread_environment_bindings
        WHERE thread_id = ? AND is_active = 1
        ORDER BY attached_at DESC, binding_id DESC
        LIMIT 1
        `,
        threadId,
      ),
    );
  }

  upsertJob(job: JobRecord): void {
    this.run(
      `
      INSERT INTO projects_jobs (
        job_id, thread_id, author, body, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        author = excluded.author,
        body = excluded.body,
        created_at = excluded.created_at
      `,
      job.jobId,
      job.threadId,
      job.author,
      job.body,
      job.createdAt,
    );
  }

  listJobs(threadId?: string): JobRecord[] {
    const rows = threadId
      ? this.all<SqliteRow>(
          `
          SELECT job_id, thread_id, author, body, created_at
          FROM projects_jobs
          WHERE thread_id = ?
          ORDER BY created_at ASC
          `,
          threadId,
        )
      : this.all<SqliteRow>(
          `
          SELECT job_id, thread_id, author, body, created_at
          FROM projects_jobs
          ORDER BY created_at ASC
          `,
        );

    return rows.map((row) => normalizeJobRow(row)).filter((row): row is JobRecord => Boolean(row));
  }

  upsertExternalRef(externalRef: ExternalRefRecord): void {
    this.run(
      `
      INSERT INTO projects_external_refs (
        external_ref_id, owner_type, owner_id, system, external_id, external_key, session_id,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_ref_id) DO UPDATE SET
        owner_type = excluded.owner_type,
        owner_id = excluded.owner_id,
        system = excluded.system,
        external_id = excluded.external_id,
        external_key = excluded.external_key,
        session_id = excluded.session_id,
        metadata_json = excluded.metadata_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      externalRef.externalRefId,
      externalRef.ownerType,
      externalRef.ownerId,
      externalRef.system,
      externalRef.externalId,
      externalRef.externalKey ?? null,
      externalRef.sessionId ?? null,
      externalRef.metadataJson ?? null,
      externalRef.createdAt,
      externalRef.updatedAt,
    );
  }

  listExternalRefs(
    ownerType?: ExternalRefRecord["ownerType"],
    ownerId?: string,
  ): ExternalRefRecord[] {
    let rows: SqliteRow[];
    if (ownerType && ownerId) {
      rows = this.all<SqliteRow>(
        `
        SELECT external_ref_id, owner_type, owner_id, system, external_id, external_key,
               session_id, metadata_json, created_at, updated_at
        FROM projects_external_refs
        WHERE owner_type = ? AND owner_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        ownerType,
        ownerId,
      );
    } else if (ownerType) {
      rows = this.all<SqliteRow>(
        `
        SELECT external_ref_id, owner_type, owner_id, system, external_id, external_key,
               session_id, metadata_json, created_at, updated_at
        FROM projects_external_refs
        WHERE owner_type = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        ownerType,
      );
    } else if (ownerId) {
      rows = this.all<SqliteRow>(
        `
        SELECT external_ref_id, owner_type, owner_id, system, external_id, external_key,
               session_id, metadata_json, created_at, updated_at
        FROM projects_external_refs
        WHERE owner_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
        ownerId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT external_ref_id, owner_type, owner_id, system, external_id, external_key,
               session_id, metadata_json, created_at, updated_at
        FROM projects_external_refs
        ORDER BY updated_at DESC, created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeExternalRefRow(row))
      .filter((row): row is ExternalRefRecord => Boolean(row));
  }

  findExternalRefsByExternal(
    system: ExternalRefRecord["system"],
    externalId: string,
    externalKey?: string,
  ): ExternalRefRecord[] {
    const rows = externalKey
      ? this.all<SqliteRow>(
          `
          SELECT external_ref_id, owner_type, owner_id, system, external_id, external_key,
                 session_id, metadata_json, created_at, updated_at
          FROM projects_external_refs
          WHERE system = ? AND external_id = ? AND external_key = ?
          ORDER BY updated_at DESC, created_at DESC
          `,
          system,
          externalId,
          externalKey,
        )
      : this.all<SqliteRow>(
          `
          SELECT external_ref_id, owner_type, owner_id, system, external_id, external_key,
                 session_id, metadata_json, created_at, updated_at
          FROM projects_external_refs
          WHERE system = ? AND external_id = ?
          ORDER BY updated_at DESC, created_at DESC
          `,
          system,
          externalId,
        );

    return rows
      .map((row) => normalizeExternalRefRow(row))
      .filter((row): row is ExternalRefRecord => Boolean(row));
  }

  upsertDispatch(dispatch: DispatchRecord): void {
    this.run(
      `
      INSERT INTO projects_dispatches (
        dispatch_id, project_id, task_id, thread_id, job_id, repo_id, worktree_id, status,
        requested_backend, requested_model, execution_session_id, summary, error,
        created_at, accepted_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dispatch_id) DO UPDATE SET
        project_id = excluded.project_id,
        task_id = excluded.task_id,
        thread_id = excluded.thread_id,
        job_id = excluded.job_id,
        repo_id = excluded.repo_id,
        worktree_id = excluded.worktree_id,
        status = excluded.status,
        requested_backend = excluded.requested_backend,
        requested_model = excluded.requested_model,
        execution_session_id = excluded.execution_session_id,
        summary = excluded.summary,
        error = excluded.error,
        created_at = excluded.created_at,
        accepted_at = excluded.accepted_at,
        completed_at = excluded.completed_at
      `,
      dispatch.dispatchId,
      dispatch.projectId,
      dispatch.taskId ?? null,
      dispatch.threadId,
      dispatch.jobId ?? null,
      dispatch.repoId ?? null,
      dispatch.worktreeId ?? null,
      dispatch.status,
      dispatch.requestedBackend ?? null,
      dispatch.requestedModel ?? null,
      dispatch.executionSessionId ?? null,
      dispatch.summary ?? null,
      dispatch.error ?? null,
      dispatch.createdAt,
      dispatch.acceptedAt ?? null,
      dispatch.completedAt ?? null,
    );
  }

  listDispatches(threadId?: string, taskId?: string): DispatchRecord[] {
    let rows: SqliteRow[];
    if (threadId && taskId) {
      rows = this.all<SqliteRow>(
        `
        SELECT dispatch_id, project_id, task_id, thread_id, job_id, repo_id, worktree_id, status,
               requested_backend, requested_model, execution_session_id, summary, error,
               created_at, accepted_at, completed_at
        FROM projects_dispatches
        WHERE thread_id = ? AND task_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
        taskId,
      );
    } else if (threadId) {
      rows = this.all<SqliteRow>(
        `
        SELECT dispatch_id, project_id, task_id, thread_id, job_id, repo_id, worktree_id, status,
               requested_backend, requested_model, execution_session_id, summary, error,
               created_at, accepted_at, completed_at
        FROM projects_dispatches
        WHERE thread_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
      );
    } else if (taskId) {
      rows = this.all<SqliteRow>(
        `
        SELECT dispatch_id, project_id, task_id, thread_id, job_id, repo_id, worktree_id, status,
               requested_backend, requested_model, execution_session_id, summary, error,
               created_at, accepted_at, completed_at
        FROM projects_dispatches
        WHERE task_id = ?
        ORDER BY created_at DESC
        `,
        taskId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT dispatch_id, project_id, task_id, thread_id, job_id, repo_id, worktree_id, status,
               requested_backend, requested_model, execution_session_id, summary, error,
               created_at, accepted_at, completed_at
        FROM projects_dispatches
        ORDER BY created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeDispatchRow(row))
      .filter((row): row is DispatchRecord => Boolean(row));
  }

  getDispatch(dispatchId: string): DispatchRecord | undefined {
    return normalizeDispatchRow(
      this.get<SqliteRow>(
        `
        SELECT dispatch_id, project_id, task_id, thread_id, job_id, repo_id, worktree_id, status,
               requested_backend, requested_model, execution_session_id, summary, error,
               created_at, accepted_at, completed_at
        FROM projects_dispatches
        WHERE dispatch_id = ?
        `,
        dispatchId,
      ),
    );
  }

  upsertWorktree(worktree: WorktreeRecord): void {
    this.run(
      `
      INSERT INTO projects_worktrees (
        worktree_id, repo_id, thread_id, dispatch_id, path, branch_name, base_ref, status,
        created_at, expires_at, pruned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(worktree_id) DO UPDATE SET
        repo_id = excluded.repo_id,
        thread_id = excluded.thread_id,
        dispatch_id = excluded.dispatch_id,
        path = excluded.path,
        branch_name = excluded.branch_name,
        base_ref = excluded.base_ref,
        status = excluded.status,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        pruned_at = excluded.pruned_at
      `,
      worktree.worktreeId,
      worktree.repoId,
      worktree.threadId ?? null,
      worktree.dispatchId ?? null,
      worktree.path,
      worktree.branchName,
      worktree.baseRef,
      worktree.status,
      worktree.createdAt,
      worktree.expiresAt ?? null,
      worktree.prunedAt ?? null,
    );
  }

  listWorktrees(repoId?: string, threadId?: string): WorktreeRecord[] {
    let rows: SqliteRow[];
    if (repoId && threadId) {
      rows = this.all<SqliteRow>(
        `
        SELECT worktree_id, repo_id, thread_id, dispatch_id, path, branch_name, base_ref, status,
               created_at, expires_at, pruned_at
        FROM projects_worktrees
        WHERE repo_id = ? AND thread_id = ?
        ORDER BY created_at DESC
        `,
        repoId,
        threadId,
      );
    } else if (repoId) {
      rows = this.all<SqliteRow>(
        `
        SELECT worktree_id, repo_id, thread_id, dispatch_id, path, branch_name, base_ref, status,
               created_at, expires_at, pruned_at
        FROM projects_worktrees
        WHERE repo_id = ?
        ORDER BY created_at DESC
        `,
        repoId,
      );
    } else if (threadId) {
      rows = this.all<SqliteRow>(
        `
        SELECT worktree_id, repo_id, thread_id, dispatch_id, path, branch_name, base_ref, status,
               created_at, expires_at, pruned_at
        FROM projects_worktrees
        WHERE thread_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT worktree_id, repo_id, thread_id, dispatch_id, path, branch_name, base_ref, status,
               created_at, expires_at, pruned_at
        FROM projects_worktrees
        ORDER BY created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeWorktreeRow(row))
      .filter((row): row is WorktreeRecord => Boolean(row));
  }

  getWorktree(worktreeId: string): WorktreeRecord | undefined {
    return normalizeWorktreeRow(
      this.get<SqliteRow>(
        `
        SELECT worktree_id, repo_id, thread_id, dispatch_id, path, branch_name, base_ref, status,
               created_at, expires_at, pruned_at
        FROM projects_worktrees
        WHERE worktree_id = ?
        `,
        worktreeId,
      ),
    );
  }

  upsertReview(review: ReviewRecord): void {
    this.run(
      `
      INSERT INTO projects_reviews (
        review_id, dispatch_id, thread_id, review_type, status, summary, artifact_json, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id) DO UPDATE SET
        dispatch_id = excluded.dispatch_id,
        thread_id = excluded.thread_id,
        review_type = excluded.review_type,
        status = excluded.status,
        summary = excluded.summary,
        artifact_json = excluded.artifact_json,
        created_at = excluded.created_at,
        resolved_at = excluded.resolved_at
      `,
      review.reviewId,
      review.dispatchId,
      review.threadId,
      review.reviewType,
      review.status,
      review.summary ?? null,
      review.artifactJson ?? null,
      review.createdAt,
      review.resolvedAt ?? null,
    );
  }

  listReviews(threadId?: string, dispatchId?: string): ReviewRecord[] {
    let rows: SqliteRow[];
    if (threadId && dispatchId) {
      rows = this.all<SqliteRow>(
        `
        SELECT review_id, dispatch_id, thread_id, review_type, status, summary, artifact_json, created_at, resolved_at
        FROM projects_reviews
        WHERE thread_id = ? AND dispatch_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
        dispatchId,
      );
    } else if (threadId) {
      rows = this.all<SqliteRow>(
        `
        SELECT review_id, dispatch_id, thread_id, review_type, status, summary, artifact_json, created_at, resolved_at
        FROM projects_reviews
        WHERE thread_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
      );
    } else if (dispatchId) {
      rows = this.all<SqliteRow>(
        `
        SELECT review_id, dispatch_id, thread_id, review_type, status, summary, artifact_json, created_at, resolved_at
        FROM projects_reviews
        WHERE dispatch_id = ?
        ORDER BY created_at DESC
        `,
        dispatchId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT review_id, dispatch_id, thread_id, review_type, status, summary, artifact_json, created_at, resolved_at
        FROM projects_reviews
        ORDER BY created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizeReviewRow(row))
      .filter((row): row is ReviewRecord => Boolean(row));
  }

  getReview(reviewId: string): ReviewRecord | undefined {
    return normalizeReviewRow(
      this.get<SqliteRow>(
        `
        SELECT review_id, dispatch_id, thread_id, review_type, status, summary, artifact_json, created_at, resolved_at
        FROM projects_reviews
        WHERE review_id = ?
        `,
        reviewId,
      ),
    );
  }

  upsertPublishRun(publishRun: PublishRunRecord): void {
    this.run(
      `
      INSERT INTO projects_publish_runs (
        publish_run_id, dispatch_id, thread_id, repo_id, branch_name, remote_name, status,
        commit_sha, pr_url, metadata_json, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(publish_run_id) DO UPDATE SET
        dispatch_id = excluded.dispatch_id,
        thread_id = excluded.thread_id,
        repo_id = excluded.repo_id,
        branch_name = excluded.branch_name,
        remote_name = excluded.remote_name,
        status = excluded.status,
        commit_sha = excluded.commit_sha,
        pr_url = excluded.pr_url,
        metadata_json = excluded.metadata_json,
        created_at = excluded.created_at,
        completed_at = excluded.completed_at
      `,
      publishRun.publishRunId,
      publishRun.dispatchId,
      publishRun.threadId,
      publishRun.repoId,
      publishRun.branchName,
      publishRun.remoteName,
      publishRun.status,
      publishRun.commitSha ?? null,
      publishRun.prUrl ?? null,
      publishRun.metadataJson ?? null,
      publishRun.createdAt,
      publishRun.completedAt ?? null,
    );
  }

  listPublishRuns(threadId?: string, dispatchId?: string): PublishRunRecord[] {
    let rows: SqliteRow[];
    if (threadId && dispatchId) {
      rows = this.all<SqliteRow>(
        `
        SELECT publish_run_id, dispatch_id, thread_id, repo_id, branch_name, remote_name, status,
               commit_sha, pr_url, metadata_json, created_at, completed_at
        FROM projects_publish_runs
        WHERE thread_id = ? AND dispatch_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
        dispatchId,
      );
    } else if (threadId) {
      rows = this.all<SqliteRow>(
        `
        SELECT publish_run_id, dispatch_id, thread_id, repo_id, branch_name, remote_name, status,
               commit_sha, pr_url, metadata_json, created_at, completed_at
        FROM projects_publish_runs
        WHERE thread_id = ?
        ORDER BY created_at DESC
        `,
        threadId,
      );
    } else if (dispatchId) {
      rows = this.all<SqliteRow>(
        `
        SELECT publish_run_id, dispatch_id, thread_id, repo_id, branch_name, remote_name, status,
               commit_sha, pr_url, metadata_json, created_at, completed_at
        FROM projects_publish_runs
        WHERE dispatch_id = ?
        ORDER BY created_at DESC
        `,
        dispatchId,
      );
    } else {
      rows = this.all<SqliteRow>(
        `
        SELECT publish_run_id, dispatch_id, thread_id, repo_id, branch_name, remote_name, status,
               commit_sha, pr_url, metadata_json, created_at, completed_at
        FROM projects_publish_runs
        ORDER BY created_at DESC
        `,
      );
    }

    return rows
      .map((row) => normalizePublishRunRow(row))
      .filter((row): row is PublishRunRecord => Boolean(row));
  }

  getPublishRun(publishRunId: string): PublishRunRecord | undefined {
    return normalizePublishRunRow(
      this.get<SqliteRow>(
        `
        SELECT publish_run_id, dispatch_id, thread_id, repo_id, branch_name, remote_name, status,
               commit_sha, pr_url, metadata_json, created_at, completed_at
        FROM projects_publish_runs
        WHERE publish_run_id = ?
        `,
        publishRunId,
      ),
    );
  }
}
