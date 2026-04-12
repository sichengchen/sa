import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HandoffStore } from "@aria/handoff";
import { ProjectsEngineRepository, ProjectsEngineStore } from "@aria/projects";
import { projectsCommand } from "../packages/cli/src/projects.js";

let runtimeHome = "";
let originalAriaHome: string | undefined;

async function withRepository<T>(fn: (repository: ProjectsEngineRepository) => Promise<T> | T): Promise<T> {
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
    await projectsCommand(["repo-register", "repo-1", "project-1", "aria", "git@github.com:test/aria.git", "main"]);
    await projectsCommand(["task-create", "task-1", "project-1", "Implement runtime extraction"]);
    await projectsCommand(["task-status", "task-1", "ready"]);
    await projectsCommand(["thread-create", "thread-1", "project-1", "Tracked thread"]);
    await projectsCommand(["job-add", "thread-1", "user", "Please", "continue", "this", "work"]);
    await projectsCommand(["dispatch-create", "dispatch-1", "project-1", "thread-1", "codex"]);
    await projectsCommand(["worktree-register", "worktree-1", "repo-1", "/tmp/aria-thread-1", "aria/thread/thread-1", "thread-1"]);
    await projectsCommand(["worktree-retain", "worktree-1", "12345"]);
    await projectsCommand(["worktree-prune", "worktree-1"]);
    await projectsCommand(["review-create", "dispatch-1", "thread-1", "self", "Looks", "good"]);
    const reviewId = await withRepository((repository) => repository.listReviews("thread-1")[0]?.reviewId ?? "");
    expect(reviewId).toBeTruthy();
    await projectsCommand(["review-resolve", reviewId, "approved", "Approved"]);
    await projectsCommand(["publish-create", "dispatch-1", "thread-1", "repo-1", "aria/thread/thread-1", "origin"]);
    const publishRunId = await withRepository((repository) => repository.listPublishRuns("thread-1")[0]?.publishRunId ?? "");
    expect(publishRunId).toBeTruthy();
    await projectsCommand(["publish-complete", publishRunId, "pr_created", "abc123", "https://example.com/pr/1"]);

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

  test("materializes handoffs and lists persisted output", async () => {
    await projectsCommand(["project-create", "project-2", "aria-handoff", "Aria Handoff"]);
    await projectsCommand([
      "handoff-submit",
      "project-2",
      "key-1",
      "{\"title\":\"Imported Thread\",\"body\":\"from handoff\",\"requestedBackend\":\"claude-code\"}",
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
});
