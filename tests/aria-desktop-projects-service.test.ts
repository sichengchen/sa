import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RuntimeBackendAdapter, RuntimeBackendExecutionRequest } from "@aria/agents-coding";
import type { OpenCodeModelOption } from "../packages/agents-coding/src/opencode.js";

let testDir = "";

async function createProjectDirectory(relativePath: string): Promise<string> {
  const directoryPath = join(testDir, relativePath);
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

async function createGitProjectDirectory(relativePath: string): Promise<string> {
  const directoryPath = await createProjectDirectory(relativePath);
  await writeFile(join(directoryPath, "README.md"), "# Test project\n");
  execFileSync("git", ["init", "-b", "main", directoryPath]);
  execFileSync("git", ["-C", directoryPath, "config", "user.email", "tests@example.com"]);
  execFileSync("git", ["-C", directoryPath, "config", "user.name", "Aria Tests"]);
  execFileSync("git", ["-C", directoryPath, "add", "README.md"]);
  execFileSync("git", [
    "-C",
    directoryPath,
    "-c",
    "commit.gpgSign=false",
    "commit",
    "-m",
    "Initial commit",
  ]);
  return directoryPath;
}

async function waitFor<T>(callback: () => T | null | undefined, timeoutMs = 2000): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = callback();
    if (value != null) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition");
}

function createFakeOpenCodeBackend() {
  const requests: RuntimeBackendExecutionRequest[] = [];
  const models: OpenCodeModelOption[] = [
    { label: "OpenAI / GPT-5", modelId: "openai/gpt-5" },
    { label: "Anthropic / Sonnet 4.5", modelId: "anthropic/claude-sonnet-4-5" },
  ];

  const adapter: RuntimeBackendAdapter & {
    listModels: (input: {
      env?: Record<string, string>;
      timeoutMs?: number;
      workingDirectory: string;
    }) => Promise<OpenCodeModelOption[]>;
    syncSessionTitle: (input: {
      env?: Record<string, string>;
      modelId?: string | null;
      sessionId: string;
      timeoutMs?: number;
      workingDirectory: string;
    }) => Promise<string | null>;
  } = {
    backend: "opencode",
    capabilities: {
      supportsAuthProbe: false,
      supportsBackgroundExecution: false,
      supportsCancellation: true,
      supportsFileEditing: true,
      supportsStreamingEvents: false,
      supportsStructuredOutput: true,
    },
    displayName: "OpenCode",
    async cancel() {},
    async execute(request) {
      requests.push(request);
      const sessionId = request.sessionId ?? `ses_${requests.length}`;

      return {
        backend: "opencode",
        executionId: request.executionId,
        exitCode: 0,
        filesChanged: ["src/desktop-projects.ts"],
        metadata: {
          sessionId,
        },
        status: "succeeded",
        stderr: "",
        stdout: "",
        summary: `Handled: ${request.prompt}`,
      };
    },
    async probeAvailability() {
      return {
        authState: "unknown" as const,
        available: true,
        detectedVersion: "1.4.3",
        reason: null,
      };
    },
    async listModels() {
      return models;
    },
    async syncSessionTitle() {
      return "Handled by OpenCode";
    },
  };

  return { adapter, models, requests };
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "aria-desktop-projects-service-"));
});

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { force: true, recursive: true });
  }
});

describe("DesktopProjectsService", () => {
  test("bootstraps the desktop database and shared local workspace", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const service = new DesktopProjectsService({ dbPath });

    service.init();

    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const workspace = db
      .prepare(
        `
          SELECT workspace_id, host, label
          FROM projects_workspaces
          WHERE workspace_id = 'desktop-local-workspace'
        `,
      )
      .get() as { host: string; label: string; workspace_id: string } | undefined;

    expect(workspace).toEqual({
      host: "desktop_local",
      label: "This Device",
      workspace_id: "desktop-local-workspace",
    });

    db.close();
    service.close();
  });

  test("imports a local folder as a project, creates a default thread, and selects it", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/atlas-app");
    const service = new DesktopProjectsService({
      dbPath,
      now: () => 1_000,
      readGitMetadata: async () => null,
    });
    const normalizedProjectPath = await realpath(projectPath);

    service.init();
    const shellState = await service.importLocalProjectFromPath(projectPath);

    expect(shellState.projects).toHaveLength(1);
    expect(shellState.projects[0]).toMatchObject({
      name: "atlas-app",
      rootPath: normalizedProjectPath,
    });
    expect(shellState.selectedProjectId).toBe(shellState.projects[0]?.projectId);
    expect(shellState.selectedThreadId).toBeTruthy();
    expect(shellState.projects[0]?.threads).toHaveLength(1);

    const db = new Database(dbPath, { readonly: true });
    const environmentCount = db
      .prepare(`SELECT COUNT(*) AS count FROM projects_environments WHERE project_id = ?`)
      .get(shellState.projects[0]?.projectId) as { count: number };
    const repoCount = db
      .prepare(`SELECT COUNT(*) AS count FROM projects_repos WHERE project_id = ?`)
      .get(shellState.projects[0]?.projectId) as { count: number };
    const threadCount = db
      .prepare(`SELECT COUNT(*) AS count FROM projects_threads WHERE project_id = ?`)
      .get(shellState.projects[0]?.projectId) as { count: number };

    expect(environmentCount.count).toBe(1);
    expect(repoCount.count).toBe(0);
    expect(threadCount.count).toBe(1);

    db.close();
    service.close();
  });

  test("imports a local project through the dialog-backed flow when the picker returns a folder", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/dialog-project");
    const normalizedProjectPath = await realpath(projectPath);
    const service = new DesktopProjectsService({
      dbPath,
      pickDirectory: async () => projectPath,
      readGitMetadata: async () => null,
    });

    service.init();
    const shellState = await service.importLocalProjectFromDialog();

    expect(shellState.projects).toHaveLength(1);
    expect(shellState.projects[0]).toMatchObject({
      name: "dialog-project",
      rootPath: normalizedProjectPath,
    });
    expect(shellState.selectedThreadId).toBeTruthy();

    service.close();
  });

  test("re-importing the same folder re-selects the existing project instead of duplicating it", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/atlas-app");
    const service = new DesktopProjectsService({
      dbPath,
      readGitMetadata: async () => null,
    });

    service.init();
    const first = await service.importLocalProjectFromPath(projectPath);
    const second = await service.importLocalProjectFromPath(projectPath);

    expect(first.projects).toHaveLength(1);
    expect(second.projects).toHaveLength(1);
    expect(second.selectedProjectId).toBe(first.selectedProjectId);
    expect(second.selectedThreadId).toBe(first.selectedThreadId);

    const db = new Database(dbPath, { readonly: true });
    const projectCount = db.prepare(`SELECT COUNT(*) AS count FROM projects_projects`).get() as {
      count: number;
    };
    const threadCount = db.prepare(`SELECT COUNT(*) AS count FROM projects_threads`).get() as {
      count: number;
    };

    expect(projectCount.count).toBe(1);
    expect(threadCount.count).toBe(1);

    db.close();
    service.close();
  });

  test("slug collisions are suffixed deterministically across folders with the same basename", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const firstPath = await createProjectDirectory("one/shared-name");
    const secondPath = await createProjectDirectory("two/shared-name");
    const service = new DesktopProjectsService({
      dbPath,
      readGitMetadata: async () => null,
    });

    service.init();
    await service.importLocalProjectFromPath(firstPath);
    await service.importLocalProjectFromPath(secondPath);

    const db = new Database(dbPath, { readonly: true });
    const slugs = db
      .prepare(
        `
          SELECT slug
          FROM projects_projects
          ORDER BY created_at ASC
        `,
      )
      .all() as Array<{ slug: string }>;

    expect(slugs.map((row) => row.slug)).toEqual(["shared-name", "shared-name-2"]);

    db.close();
    service.close();
  });

  test("creating a thread persists a thread and an active environment binding", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/atlas-app");
    const service = new DesktopProjectsService({
      dbPath,
      now: () => 2_000,
      readGitMetadata: async () => null,
    });

    service.init();
    const imported = await service.importLocalProjectFromPath(projectPath);
    const projectId = imported.selectedProjectId;
    expect(projectId).toBeTruthy();

    const shellState = service.createThread(projectId!);
    const threadId = shellState.selectedThreadId;
    expect(threadId).toBeTruthy();

    const db = new Database(dbPath, { readonly: true });
    const thread = db
      .prepare(
        `
          SELECT thread_id, agent_id, environment_binding_id, environment_id, thread_type
          FROM projects_threads
          WHERE thread_id = ?
        `,
      )
      .get(threadId) as
      | {
          agent_id: string;
          environment_binding_id: string;
          environment_id: string;
          thread_id: string;
          thread_type: string;
        }
      | undefined;
    const binding = db
      .prepare(
        `
          SELECT binding_id, is_active
          FROM projects_thread_environment_bindings
          WHERE thread_id = ?
        `,
      )
      .get(threadId) as { binding_id: string; is_active: number } | undefined;

    expect(thread).toMatchObject({
      agent_id: "opencode",
      thread_id: threadId,
      thread_type: "local_project",
    });
    expect(thread?.environment_binding_id).toBeTruthy();
    expect(thread?.environment_id).toBeTruthy();
    expect(binding).toMatchObject({
      binding_id: thread?.environment_binding_id,
      is_active: 1,
    });

    db.close();
    service.close();
  });

  test("persists project-thread chat history and reuses the opencode session across turns", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/local-agent-project");
    const backend = createFakeOpenCodeBackend();
    let now = 5_000;
    const service = new DesktopProjectsService({
      backendRegistry: new Map([["opencode", backend.adapter]]),
      dbPath,
      localAgentRuntimeRoot: join(testDir, "opencode-runtime"),
      now: () => {
        now += 1;
        return now;
      },
      readGitMetadata: async () => null,
    });

    service.init();
    const imported = await service.importLocalProjectFromPath(projectPath);
    const threadId = imported.selectedThreadId;
    expect(threadId).toBeTruthy();
    await waitFor(() =>
      service
        .getProjectShellState()
        .selectedThreadState?.availableModels.find((option) => option.modelId === "openai/gpt-5"),
    );

    const modelSelected = service.setProjectThreadModel(threadId!, "openai/gpt-5");
    const first = await service.sendProjectThreadMessage(threadId!, "Implement the project pane");
    const second = await service.sendProjectThreadMessage(threadId!, "Keep going");

    expect(backend.requests).toHaveLength(2);
    expect(modelSelected.selectedThreadState).toMatchObject({
      modelId: "openai/gpt-5",
      modelLabel: "GPT-5",
    });
    expect(backend.requests[0]?.modelId).toBe("openai/gpt-5");
    expect(backend.requests[0]?.sessionId).toBeNull();
    expect(backend.requests[0]?.env?.XDG_DATA_HOME).toBeUndefined();
    expect(backend.requests[1]?.sessionId).toBe("ses_1");

    expect(first.selectedThreadState).toMatchObject({
      agentId: "opencode",
      agentLabel: "OpenCode",
      backendSessionId: "ses_1",
      changedFiles: ["src/desktop-projects.ts"],
      status: "dirty",
      title: "Handled by OpenCode",
    });
    expect(second.selectedThreadState?.chat.messages.map((message) => message.content)).toEqual([
      "Implement the project pane",
      "Handled: Implement the project pane",
      "Keep going",
      "Handled: Keep going",
    ]);

    service.close();

    const reopened = new DesktopProjectsService({
      backendRegistry: new Map([["opencode", backend.adapter]]),
      dbPath,
      localAgentRuntimeRoot: join(testDir, "opencode-runtime"),
      readGitMetadata: async () => null,
    });
    reopened.init();

    const restored = reopened.getProjectShellState();

    expect(restored.selectedThreadState).toMatchObject({
      backendSessionId: "ses_1",
      changedFiles: ["src/desktop-projects.ts"],
    });
    expect(restored.selectedThreadState?.chat.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);

    reopened.close();
  });

  test("switches the active project thread branch and model through desktop transitions", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/branch-switch-project");
    const backendRegistry = new Map([["opencode", createFakeOpenCodeBackend().adapter]]);
    const service = new DesktopProjectsService({
      backendRegistry,
      dbPath,
      localAgentRuntimeRoot: join(testDir, "opencode-runtime"),
      readGitMetadata: async () => null,
    });

    service.init();
    const imported = await service.importLocalProjectFromPath(projectPath);
    const threadId = imported.selectedThreadId!;
    const projectId = imported.selectedProjectId!;
    await waitFor(() =>
      service
        .getProjectShellState()
        .selectedThreadState?.availableModels.find((option) => option.modelId === "openai/gpt-5"),
    );

    const db = new Database(dbPath);
    db.prepare(
      `
        INSERT INTO projects_environments (
          environment_id, workspace_id, project_id, label, mode, kind, locator, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "env-worktree",
      "desktop-local-workspace",
      projectId,
      "This Device / feature-ui",
      "local",
      "worktree",
      join(projectPath, "..", "branch-switch-project-feature-ui"),
      10,
      10,
    );
    db.close();

    const switchedEnvironment = service.switchProjectThreadEnvironment(threadId, "env-worktree");
    await waitFor(() =>
      service
        .getProjectShellState()
        .selectedThreadState?.availableModels.find((option) => option.modelId === "openai/gpt-5"),
    );
    const switchedModel = service.setProjectThreadModel(threadId, "openai/gpt-5");

    expect(switchedEnvironment.selectedThreadState).toMatchObject({
      backendSessionId: null,
      environmentId: "env-worktree",
      environmentLabel: "This Device / feature-ui",
    });
    expect(switchedEnvironment.selectedThreadState?.availableBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          environmentId: "env-worktree",
          selected: true,
          value: "feature-ui",
        }),
      ]),
    );
    expect(switchedModel.selectedThreadState).toMatchObject({
      agentId: "opencode",
      agentLabel: "OpenCode",
      modelId: "openai/gpt-5",
      modelLabel: "GPT-5",
    });
    expect(switchedModel.selectedThreadState?.availableModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "OpenAI / GPT-5",
          modelId: "openai/gpt-5",
          selected: true,
        }),
        expect.objectContaining({ label: "Default", modelId: null, selected: false }),
      ]),
    );

    service.close();
  });

  test("creates and checks out a new branch as a local worktree environment", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createGitProjectDirectory("projects/create-branch-project");
    const service = new DesktopProjectsService({
      dbPath,
      now: () => 11_000,
    });

    service.init();
    const imported = await service.importLocalProjectFromPath(projectPath);
    const threadId = imported.selectedThreadId!;

    const createdBranch = await service.createProjectThreadBranch(
      threadId,
      "feature-inline-branch",
    );

    expect(createdBranch.selectedThreadState).toMatchObject({
      environmentLabel: "This Device / feature-inline-branch",
    });
    expect(createdBranch.selectedThreadState?.availableBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selected: true,
          value: "feature-inline-branch",
        }),
      ]),
    );

    const createdEnvironment = createdBranch.selectedThreadState?.availableBranches.find(
      (option) => option.value === "feature-inline-branch",
    );
    expect(createdEnvironment?.environmentId).toBeTruthy();
    expect(createdEnvironment?.locator).toBeTruthy();
    const createdEnvironmentId = createdEnvironment?.environmentId;
    const createdEnvironmentLocator = createdEnvironment?.locator;

    if (!createdEnvironmentId || !createdEnvironmentLocator) {
      throw new Error("Expected the created branch environment to be available.");
    }

    expect(existsSync(createdEnvironmentLocator)).toBe(true);

    const checkedOutBranch = execFileSync(
      "git",
      ["-C", createdEnvironmentLocator, "branch", "--show-current"],
      { encoding: "utf8" },
    ).trim();
    expect(checkedOutBranch).toBe("feature-inline-branch");

    const db = new Database(dbPath, { readonly: true });
    const environment = db
      .prepare(
        `
          SELECT kind, mode, locator, label
          FROM projects_environments
          WHERE environment_id = ?
        `,
      )
      .get(createdEnvironmentId) as
      | { kind: string; label: string; locator: string; mode: string }
      | undefined;

    expect(environment).toMatchObject({
      kind: "worktree",
      label: "This Device / feature-inline-branch",
      mode: "local",
    });
    expect(environment?.locator).toBe(createdEnvironmentLocator);

    db.close();
    service.close();
  });

  test("selection and collapsed groups persist across service restarts", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const firstPath = await createProjectDirectory("projects/atlas-app");
    const secondPath = await createProjectDirectory("projects/mercury-api");
    const service = new DesktopProjectsService({
      dbPath,
      now: () => 3_000,
      readGitMetadata: async () => null,
    });

    service.init();
    const first = await service.importLocalProjectFromPath(firstPath);
    const second = await service.importLocalProjectFromPath(secondPath);
    const firstProjectId = first.projects[0]?.projectId;
    const secondProjectId = second.selectedProjectId;
    expect(firstProjectId).toBeTruthy();
    expect(secondProjectId).toBeTruthy();

    const threadState = service.createThread(firstProjectId!);
    expect(threadState.selectedThreadId).toBeTruthy();

    service.selectThread(firstProjectId!, threadState.selectedThreadId!);
    service.setProjectCollapsed(secondProjectId!, true);
    service.close();

    const reopened = new DesktopProjectsService({
      dbPath,
      readGitMetadata: async () => null,
    });
    reopened.init();

    const restored = reopened.getProjectShellState();

    expect(restored.selectedProjectId).toBe(firstProjectId);
    expect(restored.selectedThreadId).toBe(threadState.selectedThreadId);
    expect(restored.collapsedProjectIds).toEqual([secondProjectId!]);

    reopened.close();
  });

  test("pins and archives project threads with persistence across restart", async () => {
    const { DesktopProjectsService } =
      await import("../apps/aria-desktop/src/main/desktop-projects-service.js");
    const dbPath = join(testDir, "desktop", "aria-desktop.db");
    const projectPath = await createProjectDirectory("projects/pinned-project");
    const service = new DesktopProjectsService({
      dbPath,
      readGitMetadata: async () => null,
    });

    service.init();
    const imported = await service.importLocalProjectFromPath(projectPath);
    const projectId = imported.selectedProjectId!;
    const firstThreadId = imported.selectedThreadId!;
    const secondThreadState = service.createThread(projectId);
    const secondThreadId = secondThreadState.selectedThreadId!;

    const pinned = service.setProjectThreadPinned(firstThreadId, true);
    const archived = service.archiveProjectThread(secondThreadId);

    expect(pinned.pinnedThreadIds).toEqual([firstThreadId]);
    expect(pinned.projects[0]?.threads[0]).toMatchObject({
      pinned: true,
      threadId: firstThreadId,
    });
    expect(archived.archivedThreadIds).toEqual([secondThreadId]);
    expect(archived.projects[0]?.threads.map((thread) => thread.threadId)).toEqual([firstThreadId]);

    service.close();

    const reopened = new DesktopProjectsService({
      dbPath,
      readGitMetadata: async () => null,
    });
    reopened.init();

    const restored = reopened.getProjectShellState();

    expect(restored.pinnedThreadIds).toEqual([firstThreadId]);
    expect(restored.archivedThreadIds).toEqual([secondThreadId]);
    expect(restored.projects[0]?.threads.map((thread) => thread.threadId)).toEqual([firstThreadId]);

    reopened.close();
  });
});
