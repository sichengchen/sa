import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createDesktopBridge } from "@aria/desktop-bridge";
import { ProjectsEngineRepository, ProjectsEngineStore } from "@aria/projects";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function createRepository(prefix: string): Promise<ProjectsEngineRepository> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  const store = new ProjectsEngineStore(join(dir, "aria.db"));
  await store.init();
  return new ProjectsEngineRepository(store);
}

describe("desktop bridge", () => {
  test("exposes durable thread environment switching through the desktop-local boundary", async () => {
    const repository = await createRepository("aria-desktop-bridge-");
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-1",
      slug: "aria",
      name: "Aria",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertServer({
      serverId: "server-1",
      label: "Home Server",
      primaryBaseUrl: "https://aria.example.test",
      secondaryBaseUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertWorkspace({
      workspaceId: "workspace-local",
      host: "desktop_local",
      serverId: null,
      label: "This Device",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertWorkspace({
      workspaceId: "workspace-remote",
      host: "aria_server",
      serverId: "server-1",
      label: "Home Server",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertEnvironment({
      environmentId: "env-local",
      workspaceId: "workspace-local",
      projectId: "project-1",
      label: "This Device / wt/main",
      mode: "local",
      kind: "worktree",
      locator: "/tmp/aria-main",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertEnvironment({
      environmentId: "env-remote",
      workspaceId: "workspace-remote",
      projectId: "project-1",
      label: "Home Server / wt/review",
      mode: "remote",
      kind: "worktree",
      locator: "ssh://aria/review",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-1",
      projectId: "project-1",
      taskId: null,
      repoId: null,
      title: "Tracked thread",
      status: "idle",
      threadType: "local_project",
      workspaceId: "workspace-local",
      environmentId: "env-local",
      environmentBindingId: "binding-local",
      agentId: "codex",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThreadEnvironmentBinding({
      bindingId: "binding-local",
      threadId: "thread-1",
      projectId: "project-1",
      workspaceId: "workspace-local",
      environmentId: "env-local",
      attachedAt: now,
      detachedAt: null,
      isActive: true,
      reason: "Initial local binding",
    });

    const bridge = createDesktopBridge({ repository });
    const switched = bridge.threadEnvironments.switchThreadEnvironment(
      {
        bindingId: "binding-remote",
        threadId: "thread-1",
        environmentId: "env-remote",
        reason: "Switch through desktop bridge",
      },
      now + 1,
    );

    expect(switched.thread.threadType).toBe("remote_project");
    expect(switched.thread.workspaceId).toBe("workspace-remote");
    expect(switched.thread.environmentId).toBe("env-remote");
    expect(switched.activeBinding.bindingId).toBe("binding-remote");
    expect(
      bridge.planning.listRunnableThreads({ projectId: "project-1" })[0]?.thread,
    ).toMatchObject({
      threadId: "thread-1",
      workspaceId: "workspace-remote",
      environmentId: "env-remote",
      environmentBindingId: "binding-remote",
    });

    repository.close();
  });
});
