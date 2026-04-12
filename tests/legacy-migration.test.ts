import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

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

    db.prepare(`
      INSERT INTO projects (id, name, repo_url, base_branch, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("project-1", "Aria", "git@github.com:test/aria.git", "main", "2026-04-01T00:00:00.000Z");
    db.prepare(`
      INSERT INTO threads (id, project_id, linear_issue_id, linear_identifier, linear_session_id, title, status, worktree_path, branch_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    db.prepare(`
      INSERT INTO jobs (id, thread_id, author, body, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("job-1", "thread-1", "agent", "finished the work", "2026-04-01T01:00:00.000Z");
    db.close();

    const proc = Bun.spawn([
      process.execPath,
      "run",
      "scripts/migrate-legacy-esperta-code.ts",
      legacyDbPath,
      ariaDbPath,
      "--dry-run",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const report = JSON.parse(stdout) as {
      dryRun: boolean;
      importedProjects: number;
      importedThreads: number;
      importedJobs: number;
      importedDispatches: number;
      importedWorktrees: number;
      importedExternalRefs: number;
    };

    expect(report.dryRun).toBe(true);
    expect(report.importedProjects).toBe(1);
    expect(report.importedThreads).toBe(1);
    expect(report.importedJobs).toBe(1);
    expect(report.importedDispatches).toBe(1);
    expect(report.importedWorktrees).toBe(1);
    expect(report.importedExternalRefs).toBeGreaterThan(0);
  });
});
