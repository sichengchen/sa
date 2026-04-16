import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HandoffStore } from "@aria/handoff";
import { ProjectsEngineRepository, ProjectsEngineStore } from "@aria/projects";
import { projectsCommand } from "../packages/cli/src/projects.js";

let runtimeHome = "";
let originalAriaHome: string | undefined;

async function withRepository<T>(
  fn: (repository: ProjectsEngineRepository) => Promise<T> | T,
): Promise<T> {
  const store = new ProjectsEngineStore(join(runtimeHome, "aria.db"));
  await store.init();
  const repository = new ProjectsEngineRepository(store);
  try {
    return await fn(repository);
  } finally {
    repository.close();
  }
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return logs;
}

beforeEach(async () => {
  runtimeHome = await mkdtemp(join(tmpdir(), "aria-projects-cli-"));
  originalAriaHome = process.env.ARIA_HOME;
  process.env.ARIA_HOME = runtimeHome;
  process.exitCode = 0;
});

afterEach(() => {
  if (originalAriaHome === undefined) {
    delete process.env.ARIA_HOME;
  } else {
    process.env.ARIA_HOME = originalAriaHome;
  }
  process.exitCode = 0;
});

describe("projectsCommand", () => {
  test("creates and mutates tracked work records through the CLI", async () => {
    await projectsCommand(["project-create", "project-1", "aria", "Aria"]);
    await projectsCommand([
      "repo-register",
      "repo-1",
      "project-1",
      "aria",
      "git@github.com:test/aria.git",
      "main",
    ]);
    await projectsCommand(["task-create", "task-1", "project-1", "Implement runtime extraction"]);
    await projectsCommand(["task-status", "task-1", "ready"]);
    await projectsCommand(["thread-create", "thread-1", "project-1", "Tracked thread"]);
    await projectsCommand(["job-add", "thread-1", "user", "Please", "continue", "this", "work"]);
    await projectsCommand(["dispatch-create", "dispatch-1", "project-1", "thread-1", "codex"]);
    await projectsCommand([
      "worktree-register",
      "worktree-1",
      "repo-1",
      "/tmp/aria-thread-1",
      "aria/thread/thread-1",
      "thread-1",
    ]);
    await projectsCommand(["worktree-retain", "worktree-1", "12345"]);
    await projectsCommand(["worktree-prune", "worktree-1"]);
    await projectsCommand(["review-create", "dispatch-1", "thread-1", "self", "Looks", "good"]);
    const reviewId = await withRepository(
      (repository) => repository.listReviews("thread-1")[0]?.reviewId ?? "",
    );
    expect(reviewId).toBeTruthy();
    await projectsCommand(["review-resolve", reviewId, "approved", "Approved"]);
    await projectsCommand([
      "publish-create",
      "dispatch-1",
      "thread-1",
      "repo-1",
      "aria/thread/thread-1",
      "origin",
    ]);
    const publishRunId = await withRepository(
      (repository) => repository.listPublishRuns("thread-1")[0]?.publishRunId ?? "",
    );
    expect(publishRunId).toBeTruthy();
    await projectsCommand([
      "publish-complete",
      publishRunId,
      "pr_created",
      "abc123",
      "https://example.com/pr/1",
    ]);

    await withRepository((repository) => {
      expect(repository.getProject("project-1")?.name).toBe("Aria");
      expect(repository.getRepo("repo-1")?.defaultBranch).toBe("main");
      expect(repository.getTask("task-1")?.status).toBe("ready");
      expect(repository.getThread("thread-1")?.title).toBe("Tracked thread");
      expect(repository.listJobs("thread-1")).toHaveLength(1);
      expect(repository.getDispatch("dispatch-1")?.requestedBackend).toBe("codex");
      expect(repository.getWorktree("worktree-1")?.status).toBe("pruned");
      expect(repository.getReview(reviewId)?.status).toBe("approved");
      expect(repository.getPublishRun(publishRunId)?.prUrl).toBe("https://example.com/pr/1");
    });
  });

  test("creates, updates, and lists server hierarchy records through the CLI", async () => {
    await projectsCommand([
      "server-create",
      "server-1",
      "Aria",
      "Server",
      "--primary-url",
      "https://aria.example",
      "--secondary-url",
      "https://gateway.example/server-1",
    ]);
    await projectsCommand([
      "server-create",
      "server-2",
      "Published",
      "Gateway",
      "--secondary-url",
      "https://gateway.example/server-2",
    ]);
    await projectsCommand([
      "server-update",
      "server-1",
      "Aria",
      "Server",
      "Primary",
      "--primary-url",
      "https://aria.example/v2",
      "--secondary-url",
      "https://gateway.example/server-1/v2",
    ]);

    await projectsCommand([
      "workspace-create",
      "workspace-1",
      "desktop_local",
      "Local",
      "Workspace",
      "--server",
      "server-1",
    ]);
    await projectsCommand([
      "workspace-create",
      "workspace-2",
      "aria_server",
      "Remote",
      "Workspace",
      "--server",
      "server-1",
    ]);
    await projectsCommand([
      "workspace-update",
      "workspace-1",
      "aria_server",
      "Aria",
      "Workspace",
      "Primary",
      "--server",
      "server-2",
    ]);

    await projectsCommand(["project-create", "project-1", "project-one", "Project One"]);
    await projectsCommand(["project-create", "project-2", "project-two", "Project Two"]);

    await projectsCommand([
      "environment-create",
      "environment-1",
      "workspace-1",
      "project-1",
      "local",
      "worktree",
      "/tmp/worktrees/project-1",
      "Local",
      "Worktree",
    ]);
    await projectsCommand([
      "environment-create",
      "environment-2",
      "workspace-2",
      "project-1",
      "remote",
      "sandbox",
      "ssh://aria/workspaces/workspace-2",
      "Remote",
      "Sandbox",
    ]);
    await projectsCommand([
      "environment-update",
      "environment-1",
      "workspace-2",
      "project-2",
      "remote",
      "main",
      "ssh://aria/environments/environment-1",
      "Remote",
      "Project",
    ]);

    const serverLogs = await captureLogs(async () => {
      await projectsCommand(["servers"]);
    });
    const workspaceLogs = await captureLogs(async () => {
      await projectsCommand(["workspaces", "server-2"]);
    });
    const environmentLogs = await captureLogs(async () => {
      await projectsCommand(["environments", "project-2", "workspace-2"]);
    });

    expect(serverLogs.join("\n")).toContain("server-1");
    expect(serverLogs.join("\n")).toContain("Aria Server Primary");
    expect(serverLogs.join("\n")).toContain("primary-url=https://aria.example/v2");
    expect(serverLogs.join("\n")).toContain("secondary-url=https://gateway.example/server-1/v2");
    expect(serverLogs.join("\n")).toContain("server-2");

    expect(workspaceLogs).toHaveLength(1);
    expect(workspaceLogs[0]).toContain("workspace-1");
    expect(workspaceLogs[0]).toContain("Aria Workspace Primary");
    expect(workspaceLogs[0]).toContain("server=server-2");

    expect(environmentLogs).toHaveLength(1);
    expect(environmentLogs[0]).toContain("environment-1");
    expect(environmentLogs[0]).toContain("Remote Project");
    expect(environmentLogs[0]).toContain("project=project-2");
    expect(environmentLogs[0]).toContain("workspace=workspace-2");

    await withRepository((repository) => {
      expect(repository.getServer("server-1")?.label).toBe("Aria Server Primary");
      expect(repository.getServer("server-1")?.primaryBaseUrl).toBe("https://aria.example/v2");
      expect(repository.getServer("server-1")?.secondaryBaseUrl).toBe(
        "https://gateway.example/server-1/v2",
      );
      expect(repository.getWorkspace("workspace-1")?.serverId).toBe("server-2");
      expect(repository.getWorkspace("workspace-1")?.label).toBe("Aria Workspace Primary");
      expect(repository.getEnvironment("environment-1")?.projectId).toBe("project-2");
      expect(repository.getEnvironment("environment-1")?.workspaceId).toBe("workspace-2");
      expect(repository.getEnvironment("environment-1")?.label).toBe("Remote Project");
      expect(
        repository.listWorkspaces("server-2").map((workspace) => workspace.workspaceId),
      ).toEqual(["workspace-1"]);
      expect(
        repository
          .listEnvironments("project-2", "workspace-2")
          .map((environment) => environment.environmentId),
      ).toEqual(["environment-1"]);
    });
  });

  test("materializes handoffs and lists persisted output", async () => {
    await projectsCommand(["project-create", "project-2", "aria-handoff", "Aria Handoff"]);
    await projectsCommand([
      "handoff-submit",
      "project-2",
      "key-1",
      '{"title":"Imported Thread","body":"from handoff","requestedBackend":"claude-code"}',
    ]);

    const handoffStore = new HandoffStore(join(runtimeHome, "aria.db"));
    await handoffStore.init();
    const handoffId = handoffStore.list("project-2")[0]?.handoffId ?? "";
    handoffStore.close();
    expect(handoffId).toBeTruthy();

    await projectsCommand(["handoff-process", handoffId]);

    await withRepository((repository) => {
      const dispatch = repository.listDispatches()[0];
      expect(dispatch?.projectId).toBe("project-2");
      expect(dispatch?.requestedBackend).toBe("claude-code");
      expect(repository.getThread(dispatch?.threadId ?? "")?.title).toBe("Imported Thread");
      expect(repository.listJobs(dispatch?.threadId ?? "")).toHaveLength(1);
    });

    const logs = await captureLogs(async () => {
      await projectsCommand(["dispatches"]);
      await projectsCommand(["handoffs", "project-2"]);
    });

    expect(logs.some((line) => line.includes("dispatch:"))).toBe(true);
    expect(logs.some((line) => line.includes(handoffId))).toBe(true);
  });

  test("creates richer tracked threads and exposes environment bindings", async () => {
    await projectsCommand([
      "project-create",
      "project-3",
      "aria-thread-model",
      "Aria Thread Model",
    ]);
    await projectsCommand(["workspace-create", "workspace-1", "desktop_local", "This", "Device"]);
    await projectsCommand(["workspace-create", "workspace-2", "aria_server", "Home", "Server"]);
    await projectsCommand([
      "environment-create",
      "environment-1",
      "workspace-1",
      "project-3",
      "local",
      "worktree",
      "/tmp/aria-main",
      "This",
      "Device",
      "/",
      "wt/main",
    ]);
    await projectsCommand([
      "environment-create",
      "environment-2",
      "workspace-2",
      "project-3",
      "remote",
      "worktree",
      "ssh://aria/review",
      "Home",
      "Server",
      "/",
      "wt/review",
    ]);
    await projectsCommand([
      "thread-create",
      "thread-3",
      "project-3",
      "Tracked",
      "project",
      "thread",
      "--type",
      "local_project",
      "--status",
      "running",
      "--workspace",
      "workspace-1",
      "--environment",
      "environment-1",
      "--binding",
      "binding-1",
      "--agent",
      "codex",
    ]);
    await projectsCommand([
      "thread-bind",
      "binding-1",
      "thread-3",
      "project-3",
      "workspace-1",
      "environment-1",
      "initial",
      "local",
      "attachment",
    ]);
    await projectsCommand([
      "thread-bind",
      "binding-2",
      "thread-3",
      "project-3",
      "workspace-2",
      "environment-2",
      "switched",
      "to",
      "remote",
    ]);

    const threadLogs = await captureLogs(async () => {
      await projectsCommand(["threads", "project-3"]);
    });
    const bindingLogs = await captureLogs(async () => {
      await projectsCommand(["thread-bindings", "thread-3"]);
    });

    expect(threadLogs.join("\n")).toContain("[Remote Project]");
    expect(threadLogs.join("\n")).toContain("workspace=workspace-2");
    expect(threadLogs.join("\n")).toContain("environment=environment-2");
    expect(threadLogs.join("\n")).toContain("binding=binding-2");

    expect(bindingLogs[0]).toContain("binding-2");
    expect(bindingLogs[0]).toContain("[active]");
    expect(bindingLogs[1]).toContain("binding-1");
    expect(bindingLogs[1]).toContain("[inactive]");

    await withRepository((repository) => {
      const thread = repository.getThread("thread-3");
      expect(thread?.threadType).toBe("remote_project");
      expect(thread?.workspaceId).toBe("workspace-2");
      expect(thread?.environmentId).toBe("environment-2");
      expect(thread?.environmentBindingId).toBe("binding-2");

      const bindings = repository.listThreadEnvironmentBindings("thread-3");
      expect(bindings.map((binding) => binding.bindingId)).toEqual(["binding-2", "binding-1"]);
      expect(bindings[0]?.isActive).toBe(true);
      expect(bindings[1]?.isActive).toBe(false);
      expect(repository.getActiveThreadEnvironmentBinding("thread-3")?.bindingId).toBe("binding-2");
    });
  });
});
