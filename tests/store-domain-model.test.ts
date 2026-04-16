import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { ProjectsEngineStore } from "@aria/projects/store";
import {
  ARIA_DOMAIN_RELATIONS,
  OperationalStore,
  createAriaStoreMigrationBackup,
  listAriaDomainRelations,
  restoreAriaStoreMigrationBackup,
} from "@aria/store";

describe("store domain model cutover", () => {
  test("projects and operational storage expose the canonical Aria domain relations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-domain-store-"));
    const dbPath = join(dir, "aria.db");
    const projectsStore = new ProjectsEngineStore(dbPath);
    await projectsStore.init();

    projectsStore.upsertServer({
      serverId: "server-1",
      label: "Home Server",
      primaryBaseUrl: "https://aria.example.test",
      secondaryBaseUrl: "https://gateway.example.test",
      createdAt: 1,
      updatedAt: 2,
    });
    projectsStore.upsertProject({
      projectId: "project-1",
      name: "Aria",
      slug: "aria",
      description: "Main project",
      createdAt: 3,
      updatedAt: 4,
    });
    projectsStore.upsertWorkspace({
      workspaceId: "workspace-1",
      host: "aria_server",
      serverId: "server-1",
      label: "Primary workspace",
      createdAt: 5,
      updatedAt: 6,
    });
    projectsStore.upsertEnvironment({
      environmentId: "env-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      label: "main",
      mode: "remote",
      kind: "main",
      locator: "main",
      createdAt: 7,
      updatedAt: 8,
    });
    projectsStore.upsertThread({
      threadId: "thread-1",
      projectId: "project-1",
      title: "Project thread",
      status: "running",
      threadType: "remote_project",
      workspaceId: "workspace-1",
      environmentId: "env-1",
      environmentBindingId: "binding-1",
      agentId: "codex",
      createdAt: 9,
      updatedAt: 10,
    });
    projectsStore.upsertThreadEnvironmentBinding({
      bindingId: "binding-1",
      threadId: "thread-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      environmentId: "env-1",
      attachedAt: 11,
      detachedAt: null,
      isActive: true,
      reason: "Remote main",
    });
    projectsStore.upsertJob({
      jobId: "job-1",
      threadId: "thread-1",
      author: "agent",
      body: "Investigate issue",
      createdAt: 12,
    });
    projectsStore.close();

    const operationalStore = new OperationalStore(dir);
    await operationalStore.init();
    operationalStore.upsertSession({
      id: "session-1",
      connectorType: "engine",
      connectorId: "local",
      createdAt: 13,
      lastActiveAt: 14,
    });
    operationalStore.createRun({
      runId: "run-1",
      sessionId: "session-1",
      trigger: "operator",
      status: "running",
      inputText: "Continue",
      startedAt: 15,
    });
    operationalStore.recordToolCallStart({
      toolCallId: "tool-1",
      runId: "run-1",
      sessionId: "session-1",
      toolName: "exec",
      args: { command: "git status" },
      startedAt: 16,
    });
    operationalStore.recordApprovalPending({
      approvalId: "approval-1",
      runId: "run-1",
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "exec",
      args: { command: "git status" },
      createdAt: 17,
    });
    operationalStore.upsertAutomationTask({
      taskId: "automation-1",
      taskType: "cron",
      name: "Daily summary",
      enabled: true,
      config: { schedule: "0 9 * * *" },
      createdAt: 18,
      updatedAt: 19,
      lastStatus: "success",
    });
    operationalStore.close();

    const db = new Database(dbPath, { readonly: true });
    try {
      expect(listAriaDomainRelations(db)).toEqual([...ARIA_DOMAIN_RELATIONS]);
      expect(db.prepare(`SELECT server_id, label FROM "server"`).get()).toEqual({
        server_id: "server-1",
        label: "Home Server",
      });
      expect(db.prepare(`SELECT workspace_id, server_id FROM "workspace"`).get()).toEqual({
        workspace_id: "workspace-1",
        server_id: "server-1",
      });
      expect(db.prepare(`SELECT thread_id, environment_binding_id FROM "thread"`).get()).toEqual({
        thread_id: "thread-1",
        environment_binding_id: "binding-1",
      });
      expect(
        db.prepare(`SELECT binding_id, is_active FROM "thread_environment_binding"`).get(),
      ).toEqual({ binding_id: "binding-1", is_active: 1 });
      expect(db.prepare(`SELECT session_id, thread_id FROM "session"`).get()).toEqual({
        session_id: "session-1",
        thread_id: null,
      });
      expect(db.prepare(`SELECT run_id, session_id FROM "run"`).get()).toEqual({
        run_id: "run-1",
        session_id: "session-1",
      });
      expect(db.prepare(`SELECT approval_id, status FROM "approval"`).get()).toEqual({
        approval_id: "approval-1",
        status: "pending",
      });
      expect(db.prepare(`SELECT automation_id, name FROM "automation"`).get()).toEqual({
        automation_id: "automation-1",
        name: "Daily summary",
      });
    } finally {
      db.close(false);
    }
  });

  test("creates rollback-safe backups for storage cutovers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-store-backup-"));
    const sourcePath = join(dir, "aria.db");
    const walPath = `${sourcePath}-wal`;
    const shmPath = `${sourcePath}-shm`;

    await writeFile(sourcePath, "before-main");
    await writeFile(walPath, "before-wal");
    await writeFile(shmPath, "before-shm");

    const backup = await createAriaStoreMigrationBackup(
      sourcePath,
      join(dir, ".aria-migration-backups"),
    );

    await writeFile(sourcePath, "after-main");
    await writeFile(walPath, "after-wal");
    await writeFile(shmPath, "after-shm");

    await restoreAriaStoreMigrationBackup(backup);

    expect(await readFile(sourcePath, "utf-8")).toBe("before-main");
    expect(await readFile(walPath, "utf-8")).toBe("before-wal");
    expect(await readFile(shmPath, "utf-8")).toBe("before-shm");
    expect(backup.rollbackInstructions).toContain(
      `Restore ${backup.files.main} back to ${sourcePath}.`,
    );
  });
});
