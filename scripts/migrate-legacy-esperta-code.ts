import { Database as Sqlite } from "bun:sqlite";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
  writeMode: boolean;
  migrationId: string;
  legacyDbPath: string;
  ariaDbPath: string;
  backupDirectory: string | null;
  backupCreated: boolean;
  backupMainDbPath: string | null;
  backupCompanionPaths: string[];
  manifestPath: string | null;
  rollbackHint: string | null;
  importedProjects: number;
  importedRepos: number;
  importedTasks: number;
  importedThreads: number;
  importedJobs: number;
  importedDispatches: number;
  importedWorktrees: number;
  importedExternalRefs: number;
}

interface MigrationManifest {
  migrationId: string;
  createdAt: string;
  dryRun: boolean;
  writeMode: boolean;
  legacyDbPath: string;
  ariaDbPath: string;
  backupDirectory: string | null;
  backupCreated: boolean;
  backupMainDbPath: string | null;
  backupCompanionPaths: string[];
  rollbackHint: string | null;
  rollbackInstructions: string[];
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

function createMigrationId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function safeStem(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, "");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareWriteModeSafetyArtifacts(options: {
  ariaDbPath: string;
  legacyDbPath: string;
  migrationId: string;
  startedAt: string;
}): Promise<{
  backupDirectory: string;
  backupMainDbPath: string | null;
  backupCompanionPaths: string[];
  manifestPath: string;
  backupCreated: boolean;
  rollbackHint: string;
}> {
  const stem = safeStem(options.ariaDbPath);
  const backupDirectory = join(dirname(options.ariaDbPath), ".aria-migration-backups", stem, options.migrationId);
  await mkdir(backupDirectory, { recursive: true });

  const backupCompanionPaths: string[] = [];
  let backupCreated = false;
  let backupMainDbPath: string | null = null;

  const sourceDbExists = await pathExists(options.ariaDbPath);
  if (sourceDbExists) {
    backupMainDbPath = join(backupDirectory, `${basename(options.ariaDbPath)}.sqlite`);
    await copyFile(options.ariaDbPath, backupMainDbPath);
    backupCreated = true;
  }

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sourceSidecarPath = `${options.ariaDbPath}${suffix}`;
    if (await pathExists(sourceSidecarPath)) {
      const targetSidecarPath = join(backupDirectory, `${basename(sourceSidecarPath)}`);
      await copyFile(sourceSidecarPath, targetSidecarPath);
      backupCompanionPaths.push(targetSidecarPath);
      backupCreated = true;
    }
  }

  const manifestPath = join(backupDirectory, "migration-manifest.json");
  const rollbackHint = backupMainDbPath
    ? `Restore ${options.ariaDbPath} from ${backupMainDbPath} and copy any companion files from ${backupDirectory}.`
    : `No pre-existing ${options.ariaDbPath} was found; rollback means deleting the imported database files under ${options.ariaDbPath} and restoring from source control or a fresh seed.`;

  const manifest: MigrationManifest = {
    migrationId: options.migrationId,
    createdAt: options.startedAt,
    dryRun: false,
    writeMode: true,
    legacyDbPath: options.legacyDbPath,
    ariaDbPath: options.ariaDbPath,
    backupDirectory,
    backupCreated,
    backupMainDbPath,
    backupCompanionPaths,
    rollbackHint,
    rollbackInstructions: backupMainDbPath
      ? [
          `Copy ${backupMainDbPath} back to ${options.ariaDbPath}.`,
          ...backupCompanionPaths.map((path) => `Copy ${path} back alongside ${options.ariaDbPath}.`),
          "Re-run the migration only after the rollback is complete.",
        ]
      : [
          `Delete the migrated ${options.ariaDbPath} database if you need to undo this run.`,
          "Restore the target database from its original source or seed before re-running the migration.",
        ],
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    backupDirectory,
    backupMainDbPath,
    backupCompanionPaths,
    manifestPath,
    backupCreated,
    rollbackHint,
  };
}

const args = positionalArgs();
const legacyDbPath = args[0];
const ariaDbPath = args[1] ?? join(process.env.ARIA_HOME ?? join(process.env.HOME ?? "", ".aria"), "aria.db");
const dryRun = hasFlag("--dry-run");
const migrationId = createMigrationId();
const startedAt = new Date().toISOString();

if (!legacyDbPath) {
  usage();
}

const report: MigrationReport = {
  dryRun,
  writeMode: !dryRun,
  migrationId,
  legacyDbPath,
  ariaDbPath,
  backupDirectory: null,
  backupCreated: false,
  backupMainDbPath: null,
  backupCompanionPaths: [],
  manifestPath: null,
  rollbackHint: null,
  importedProjects: 0,
  importedRepos: 0,
  importedTasks: 0,
  importedThreads: 0,
  importedJobs: 0,
  importedDispatches: 0,
  importedWorktrees: 0,
  importedExternalRefs: 0,
};

let writeModeArtifacts:
  | Awaited<ReturnType<typeof prepareWriteModeSafetyArtifacts>>
  | undefined;

if (!dryRun) {
  writeModeArtifacts = await prepareWriteModeSafetyArtifacts({
    ariaDbPath,
    legacyDbPath,
    migrationId,
    startedAt,
  });
  report.backupDirectory = writeModeArtifacts.backupDirectory;
  report.backupCreated = writeModeArtifacts.backupCreated;
  report.backupMainDbPath = writeModeArtifacts.backupMainDbPath;
  report.backupCompanionPaths = writeModeArtifacts.backupCompanionPaths;
  report.manifestPath = writeModeArtifacts.manifestPath;
  report.rollbackHint = writeModeArtifacts.rollbackHint;
} else {
  report.rollbackHint = "Dry-run mode does not mutate the target database and does not generate backup artifacts.";
}

const legacyDb = new Sqlite(legacyDbPath, { readonly: true });
const store = new ProjectsEngineStore(ariaDbPath);
try {
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
} finally {
  legacyDb.close();
  store.close();
}

console.log(JSON.stringify(report, null, 2));
