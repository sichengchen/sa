import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

const REPO_DIR = fileURLToPath(new URL("..", import.meta.url));

describe("legacy Esperta Code migration script", () => {
  test("supports dry-run reporting with dispatch and worktree counts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-legacy-migration-"));
    const legacyDbPath = join(dir, "legacy.db");
    const ariaDbPath = join(dir, "aria.db");
    const db = new Database(legacyDbPath);

    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_url TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        linear_issue_id TEXT NOT NULL,
        linear_identifier TEXT NOT NULL,
        linear_session_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        worktree_path TEXT,
        branch_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        author TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    db.prepare(
      `
      INSERT INTO projects (id, name, repo_url, base_branch, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run("project-1", "Aria", "git@github.com:test/aria.git", "main", "2026-04-01T00:00:00.000Z");
    db.prepare(
      `
      INSERT INTO threads (id, project_id, linear_issue_id, linear_identifier, linear_session_id, title, status, worktree_path, branch_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      "thread-1",
      "project-1",
      "issue-1",
      "ARIA-1",
      "session-1",
      "Legacy thread",
      "completed",
      "/tmp/worktree-1",
      "feature/thread-1",
      "2026-04-01T00:00:00.000Z",
      "2026-04-02T00:00:00.000Z",
    );
    db.prepare(
      `
      INSERT INTO jobs (id, thread_id, author, body, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run("job-1", "thread-1", "agent", "finished the work", "2026-04-01T01:00:00.000Z");
    db.close();

    const proc = Bun.spawn(
      [
        process.execPath,
        "run",
        "scripts/migrate-legacy-esperta-code.ts",
        legacyDbPath,
        ariaDbPath,
        "--dry-run",
      ],
      {
        cwd: REPO_DIR,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const report = JSON.parse(stdout) as {
      dryRun: boolean;
      writeMode: boolean;
      importedProjects: number;
      importedThreads: number;
      importedJobs: number;
      importedDispatches: number;
      importedWorktrees: number;
      importedExternalRefs: number;
      rollbackHint: string | null;
      backupDirectory: string | null;
      manifestPath: string | null;
    };

    expect(report.dryRun).toBe(true);
    expect(report.writeMode).toBe(false);
    expect(report.rollbackHint).toBe(
      "Dry-run mode does not mutate the target database and does not generate backup artifacts.",
    );
    expect(report.backupDirectory).toBeNull();
    expect(report.manifestPath).toBeNull();
    expect(report.importedProjects).toBe(1);
    expect(report.importedThreads).toBe(1);
    expect(report.importedJobs).toBe(1);
    expect(report.importedDispatches).toBe(1);
    expect(report.importedWorktrees).toBe(1);
    expect(report.importedExternalRefs).toBeGreaterThan(0);
  });

  test("writes imported records into the target database in normal mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-legacy-migration-write-"));
    const legacyDbPath = join(dir, "legacy.db");
    const ariaDbPath = join(dir, "aria.db");
    const targetDb = new Database(ariaDbPath);
    targetDb.exec(`CREATE TABLE sentinel (id TEXT PRIMARY KEY)`);
    targetDb.close();
    const db = new Database(legacyDbPath);

    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_url TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        linear_issue_id TEXT NOT NULL,
        linear_identifier TEXT NOT NULL,
        linear_session_id TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        worktree_path TEXT,
        branch_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        author TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    db.prepare(
      `
      INSERT INTO projects (id, name, repo_url, base_branch, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run("project-1", "Aria", "git@github.com:test/aria.git", "main", "2026-04-01T00:00:00.000Z");
    db.prepare(
      `
      INSERT INTO threads (id, project_id, linear_issue_id, linear_identifier, linear_session_id, title, status, worktree_path, branch_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      "thread-1",
      "project-1",
      "issue-1",
      "ARIA-1",
      "session-1",
      "Legacy thread",
      "completed",
      "/tmp/worktree-1",
      "feature/thread-1",
      "2026-04-01T00:00:00.000Z",
      "2026-04-02T00:00:00.000Z",
    );
    db.prepare(
      `
      INSERT INTO jobs (id, thread_id, author, body, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run("job-1", "thread-1", "agent", "finished the work", "2026-04-01T01:00:00.000Z");
    db.close();

    const proc = Bun.spawn(
      [process.execPath, "run", "scripts/migrate-legacy-esperta-code.ts", legacyDbPath, ariaDbPath],
      {
        cwd: REPO_DIR,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const report = JSON.parse(stdout) as {
      dryRun: boolean;
      writeMode: boolean;
      migrationId: string;
      importedProjects: number;
      importedThreads: number;
      importedJobs: number;
      importedDispatches: number;
      importedWorktrees: number;
      importedExternalRefs: number;
      rollbackHint: string | null;
      backupDirectory: string | null;
      backupCreated: boolean;
      backupMainDbPath: string | null;
      backupCompanionPaths: string[];
      manifestPath: string | null;
    };

    expect(report.dryRun).toBe(false);
    expect(report.writeMode).toBe(true);
    expect(report.importedProjects).toBe(1);
    expect(report.importedThreads).toBe(1);
    expect(report.importedJobs).toBe(1);
    expect(report.importedDispatches).toBe(1);
    expect(report.importedWorktrees).toBe(1);
    expect(report.importedExternalRefs).toBeGreaterThan(0);
    expect(report.backupCreated).toBe(true);
    expect(report.backupDirectory).not.toBeNull();
    expect(report.backupMainDbPath).not.toBeNull();
    expect(report.manifestPath).not.toBeNull();
    expect(report.rollbackHint).toContain("Restore");

    const backup = new Database(report.backupMainDbPath!);
    const backupSentinel = backup
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sentinel'`)
      .get() as { name?: string } | undefined;
    expect(backupSentinel?.name).toBe("sentinel");
    backup.close();

    const manifestRaw = await readFile(report.manifestPath!, "utf-8");
    const manifest = JSON.parse(manifestRaw) as {
      migrationId: string;
      dryRun: boolean;
      writeMode: boolean;
      backupDirectory: string | null;
      backupCreated: boolean;
      backupMainDbPath: string | null;
      backupCompanionPaths: string[];
      rollbackHint: string | null;
      rollbackInstructions: string[];
    };

    expect(manifest.migrationId).toBe(report.migrationId);
    expect(manifest.dryRun).toBe(false);
    expect(manifest.writeMode).toBe(true);
    expect(manifest.backupDirectory).toBe(report.backupDirectory);
    expect(manifest.backupCreated).toBe(true);
    expect(manifest.backupMainDbPath).toBe(report.backupMainDbPath);
    expect(manifest.rollbackHint).toBe(report.rollbackHint);
    expect(manifest.rollbackInstructions.length).toBeGreaterThan(0);

    const migrated = new Database(ariaDbPath);
    const counts = Object.fromEntries(
      [
        "projects_projects",
        "projects_repos",
        "projects_tasks",
        "projects_threads",
        "projects_jobs",
        "projects_dispatches",
        "projects_worktrees",
        "projects_external_refs",
      ].map((table) => {
        const row = migrated.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        };
        return [table, row.count];
      }),
    ) as Record<string, number>;

    expect(counts.projects_projects).toBe(1);
    expect(counts.projects_repos).toBe(1);
    expect(counts.projects_tasks).toBe(1);
    expect(counts.projects_threads).toBe(1);
    expect(counts.projects_jobs).toBe(1);
    expect(counts.projects_dispatches).toBe(1);
    expect(counts.projects_worktrees).toBe(1);
    expect(counts.projects_external_refs).toBeGreaterThan(0);
    migrated.close();
  });
});
