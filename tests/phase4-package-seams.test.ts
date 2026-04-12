import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClaudeCodeRuntimeBackendAdapter, createCodexRuntimeBackendAdapter, createOpenCodeRuntimeBackendAdapter } from "@aria/agents-coding";
import { ProjectsDispatchService } from "@aria/jobs";
import { ProjectsEngineRepository, ProjectsEngineStore, ProjectsPlanningService } from "@aria/projects";
import { ProjectsRepoService, ProjectsWorktreeService, buildBranchName, sanitizeWorktreeSegment } from "@aria/workspaces";

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

describe("phase-4 package seam verification", () => {
  test("@aria/projects preserves tracked-work planning through the new package barrel", async () => {
    const repository = await createRepository("aria-projects-package-");
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-1",
      slug: "aria",
      name: "Aria",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertTask({
      taskId: "task-1",
      projectId: "project-1",
      repoId: null,
      title: "Seed package seams",
      description: "Keep tracked work stable while package names move.",
      status: "ready",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-1",
      projectId: "project-1",
      taskId: "task-1",
      repoId: null,
      title: "Tracked thread",
      status: "idle",
      createdAt: now,
      updatedAt: now,
    });

    const planning = new ProjectsPlanningService(repository);
    const runnableThreads = planning.listRunnableThreads({ projectId: "project-1" });

    expect(runnableThreads).toHaveLength(1);
    expect(runnableThreads[0]?.thread.threadId).toBe("thread-1");
    repository.close();
  });

  test("@aria/workspaces preserves repo and worktree helpers", async () => {
    const repository = await createRepository("aria-workspaces-package-");
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-1",
      slug: "aria",
      name: "Aria",
      description: null,
      createdAt: now,
      updatedAt: now,
    });

    const repos = new ProjectsRepoService(repository);
    repos.registerRepo({
      repoId: "repo-1",
      projectId: "project-1",
      name: "aria",
      remoteUrl: "git@github.com:test/aria.git",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread/one",
      projectId: "project-1",
      taskId: null,
      repoId: "repo-1",
      title: "Tracked thread",
      status: "idle",
      createdAt: now,
      updatedAt: now,
    });

    const worktrees = new ProjectsWorktreeService(repository);
    worktrees.registerWorktree({
      worktreeId: "worktree-1",
      repoId: "repo-1",
      threadId: "thread/one",
      dispatchId: null,
      path: "/tmp/aria-thread-1",
      branchName: buildBranchName("thread/one"),
      baseRef: "main",
      status: "active",
      createdAt: now,
      expiresAt: null,
      prunedAt: null,
    });
    worktrees.markRetained("worktree-1", now + 1_000);

    expect(repos.getRepo("repo-1")?.name).toBe("aria");
    expect(sanitizeWorktreeSegment("thread/one")).toBe("thread_one");
    expect(repository.getWorktree("worktree-1")?.branchName).toBe("aria/thread/thread_one");
    expect(repository.getWorktree("worktree-1")?.status).toBe("retained");
    repository.close();
  });

  test("@aria/jobs preserves dispatch launch request helpers", async () => {
    const repository = await createRepository("aria-jobs-package-");
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-1",
      slug: "aria",
      name: "Aria",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertRepo({
      repoId: "repo-1",
      projectId: "project-1",
      name: "aria",
      remoteUrl: "git@github.com:test/aria.git",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertTask({
      taskId: "task-1",
      projectId: "project-1",
      repoId: "repo-1",
      title: "Queued work",
      description: null,
      status: "ready",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-1",
      projectId: "project-1",
      taskId: "task-1",
      repoId: "repo-1",
      title: "Tracked thread",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertJob({
      jobId: "job-1",
      threadId: "thread-1",
      author: "user",
      body: "Please continue this work.",
      createdAt: now,
    });

    repository.upsertDispatch({
      dispatchId: "dispatch-1",
      projectId: "project-1",
      taskId: "task-1",
      threadId: "thread-1",
      jobId: "job-1",
      repoId: "repo-1",
      worktreeId: null,
      status: "queued",
      requestedBackend: "codex",
      requestedModel: "gpt-5.4",
      executionSessionId: null,
      summary: null,
      error: null,
      createdAt: now,
      acceptedAt: null,
      completedAt: null,
    });

    const launch = new ProjectsDispatchService(repository).buildLaunchRequest("dispatch-1");

    expect(launch).toMatchObject({
      dispatchId: "dispatch-1",
      projectId: "project-1",
      taskId: "task-1",
      threadId: "thread-1",
      jobId: "job-1",
      repoId: "repo-1",
      requestedBackend: "codex",
      requestedModel: "gpt-5.4",
    });
    repository.close();
  });

  test("@aria/agents-coding re-exports shared coding-agent adapters", () => {
    expect(createCodexRuntimeBackendAdapter().backend).toBe("codex");
    expect(createClaudeCodeRuntimeBackendAdapter().backend).toBe("claude-code");
    expect(createOpenCodeRuntimeBackendAdapter().backend).toBe("opencode");
  });
});
