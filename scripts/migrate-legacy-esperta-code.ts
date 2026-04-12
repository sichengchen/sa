import { Database as Sqlite } from "bun:sqlite";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createLegacyLinearThreadExternalRefs,
  type DispatchRecord,
  ProjectsEngineStore,
} from "@aria/projects";

interface LegacyProjectRow {
  id: string;
  name: string;
  repo_url: string;
  base_branch: string;
}

interface LegacyThreadRow {
  id: string;
  project_id: string;
  linear_issue_id: string;
  linear_identifier: string;
  linear_session_id: string | null;
  title: string;
  status: string;
  worktree_path: string | null;
  branch_name: string | null;
  created_at: string;
  updated_at: string;
}

interface LegacyJobRow {
  id: string;
  thread_id: string;
  author: string | null;
  body: string;
  created_at: string;
}

interface MigrationReport {
  dryRun: boolean;
  legacyDbPath: string;
  ariaDbPath: string;
  importedProjects: number;
  importedRepos: number;
  importedTasks: number;
  importedThreads: number;
  importedJobs: number;
  importedDispatches: number;
  importedWorktrees: number;
  importedExternalRefs: number;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function positionalArgs(): string[] {
  return process.argv.slice(2).filter((value) => !value.startsWith("--"));
}

function asTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function usage(): never {
  console.error("Usage: bun run scripts/migrate-legacy-esperta-code.ts <legacy-db-path> [aria-db-path] [--dry-run]");
  process.exit(1);
}

function mapLegacyTaskStatus(status: string): "done" | "cancelled" | "backlog" {
  if (status === "completed") return "done";
  if (status === "stopped") return "cancelled";
  return "backlog";
}

function mapLegacyThreadStatus(status: string): "done" | "dirty" | "cancelled" | "idle" {
  if (status === "completed") return "done";
  if (status === "running_dirty") return "dirty";
  if (status === "stopped") return "cancelled";
  return "idle";
}

function mapLegacyDispatchStatus(status: string): DispatchRecord["status"] {
  if (status === "completed") return "completed";
  if (status === "stopped") return "cancelled";
  if (status === "running_dirty") return "running";
  return "queued";
}

function shouldCreateDispatch(thread: LegacyThreadRow): boolean {
  return Boolean(thread.linear_session_id || thread.worktree_path || thread.branch_name || thread.status);
}

const args = positionalArgs();
const legacyDbPath = args[0];
const ariaDbPath = args[1] ?? join(process.env.ARIA_HOME ?? join(process.env.HOME ?? "", ".aria"), "aria.db");
const dryRun = hasFlag("--dry-run");

if (!legacyDbPath) {
  usage();
}

const report: MigrationReport = {
  dryRun,
  legacyDbPath,
  ariaDbPath,
  importedProjects: 0,
  importedRepos: 0,
  importedTasks: 0,
  importedThreads: 0,
  importedJobs: 0,
  importedDispatches: 0,
  importedWorktrees: 0,
  importedExternalRefs: 0,
};

const legacyDb = new Sqlite(legacyDbPath, { readonly: true });
const store = new ProjectsEngineStore(ariaDbPath);
await store.init();

const legacyProjects = legacyDb.prepare(`
  SELECT id, name, repo_url, base_branch
  FROM projects
  ORDER BY created_at ASC
`).all() as LegacyProjectRow[];

for (const project of legacyProjects) {
  const now = Date.now();
  const repoId = `repo:${project.id}`;
  if (!dryRun) {
    store.upsertProject({
      projectId: project.id,
      name: project.name,
      slug: project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    store.upsertRepo({
      repoId,
      projectId: project.id,
      name: project.name,
      remoteUrl: project.repo_url,
      defaultBranch: project.base_branch,
      createdAt: now,
      updatedAt: now,
    });
  }
  report.importedProjects += 1;
  report.importedRepos += 1;
}

const legacyThreads = legacyDb.prepare(`
  SELECT id, project_id, linear_issue_id, linear_identifier, linear_session_id, title, status, worktree_path, branch_name, created_at, updated_at
  FROM threads
  ORDER BY created_at ASC
`).all() as LegacyThreadRow[];

for (const thread of legacyThreads) {
  const repoId = `repo:${thread.project_id}`;
  const createdAt = asTimestamp(thread.created_at);
  const updatedAt = asTimestamp(thread.updated_at);
  const taskId = `task:${thread.id}`;
  if (!dryRun) {
    store.upsertTask({
      taskId,
      projectId: thread.project_id,
      repoId,
      title: thread.title,
      description: null,
      status: mapLegacyTaskStatus(thread.status),
      createdAt,
      updatedAt,
    });
    store.upsertThread({
      threadId: thread.id,
      projectId: thread.project_id,
      taskId,
      repoId,
      title: thread.title,
      status: mapLegacyThreadStatus(thread.status),
      createdAt,
      updatedAt,
    });
  }
  report.importedTasks += 1;
  report.importedThreads += 1;

  const dispatchId = `dispatch:legacy:${thread.id}`;
  const worktreeId = thread.worktree_path && thread.branch_name ? `worktree:${thread.id}` : null;
  if (shouldCreateDispatch(thread)) {
    if (!dryRun) {
      store.upsertDispatch({
        dispatchId,
        projectId: thread.project_id,
        taskId,
        threadId: thread.id,
        jobId: null,
        repoId,
        worktreeId,
        status: mapLegacyDispatchStatus(thread.status),
        requestedBackend: null,
        requestedModel: null,
        executionSessionId: thread.linear_session_id,
        summary: "Imported from legacy Esperta Code state.",
        error: null,
        createdAt,
        acceptedAt: thread.linear_session_id ? createdAt : null,
        completedAt: thread.status === "completed" || thread.status === "stopped" ? updatedAt : null,
      });
    }
    report.importedDispatches += 1;
  }

  if (thread.worktree_path && thread.branch_name) {
    if (!dryRun) {
      store.upsertWorktree({
        worktreeId: `worktree:${thread.id}`,
        repoId,
        threadId: thread.id,
        dispatchId: shouldCreateDispatch(thread) ? dispatchId : null,
        path: thread.worktree_path,
        branchName: thread.branch_name,
        baseRef: "legacy",
        status: "retained",
        createdAt,
        expiresAt: null,
        prunedAt: null,
      });
    }
    report.importedWorktrees += 1;
  }

  for (const ref of createLegacyLinearThreadExternalRefs({
    projectId: thread.project_id,
    threadId: thread.id,
    linearIssueId: thread.linear_issue_id,
    linearIdentifier: thread.linear_identifier,
    linearSessionId: thread.linear_session_id,
    metadataJson: null,
    createdAt,
    updatedAt,
  })) {
    if (!dryRun) {
      store.upsertExternalRef(ref);
    }
    report.importedExternalRefs += 1;
  }
}

const legacyJobs = legacyDb.prepare(`
  SELECT id, thread_id, author, body, created_at
  FROM jobs
  ORDER BY created_at ASC
`).all() as LegacyJobRow[];

for (const job of legacyJobs) {
  if (!dryRun) {
    store.upsertJob({
      jobId: job.id || randomUUID(),
      threadId: job.thread_id,
      author: job.author === "agent" ? "agent" : "user",
      body: job.body,
      createdAt: asTimestamp(job.created_at),
    });
  }
  report.importedJobs += 1;
}

legacyDb.close();
store.close();

console.log(JSON.stringify(report, null, 2));
