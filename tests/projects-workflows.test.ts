import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  ProjectsEngineRepository,
  ProjectsEngineStore,
  ProjectsPublishService,
  ProjectsReviewService,
} from "@aria/projects";
import { ProjectsWorktreeService } from "@aria/workspaces";
import { HandoffService, HandoffStore } from "@aria/handoff";

const closers: Array<() => void> = [];

async function createProjectsRepository(): Promise<ProjectsEngineRepository> {
  const dir = await mkdtemp(join(tmpdir(), "aria-projects-workflows-"));
  const store = new ProjectsEngineStore(join(dir, "aria.db"));
  await store.init();
  closers.push(() => store.close());
  return new ProjectsEngineRepository(store);
}

async function createHandoffService(dbPath: string): Promise<HandoffService> {
  const store = new HandoffStore(dbPath);
  const service = new HandoffService(store);
  await service.init();
  closers.push(() => service.close());
  return service;
}

afterEach(() => {
  while (closers.length > 0) {
    closers.pop()?.();
  }
});

describe("projects workflow services", () => {
  test("review and publish services persist lifecycle updates", async () => {
    const repository = await createProjectsRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-1",
      name: "Aria",
      slug: "aria",
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
    repository.upsertThread({
      threadId: "thread-1",
      projectId: "project-1",
      taskId: null,
      repoId: "repo-1",
      title: "Tracked thread",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertDispatch({
      dispatchId: "dispatch-1",
      projectId: "project-1",
      taskId: null,
      threadId: "thread-1",
      jobId: null,
      repoId: "repo-1",
      worktreeId: null,
      status: "completed",
      requestedBackend: "aria",
      requestedModel: null,
      executionSessionId: "session-1",
      summary: "done",
      error: null,
      createdAt: now,
      acceptedAt: now,
      completedAt: now,
    });

    const reviewService = new ProjectsReviewService(repository);
    const review = reviewService.createReview({
      dispatchId: "dispatch-1",
      threadId: "thread-1",
      reviewType: "self",
      summary: "Initial self-review",
    });
    const resolvedReview = reviewService.resolveReview({
      reviewId: review.reviewId,
      status: "approved",
      summary: "Looks good",
    });

    expect(resolvedReview.status).toBe("approved");
    expect(repository.getReview(review.reviewId)?.summary).toBe("Looks good");

    const publishService = new ProjectsPublishService(repository);
    const publishRun = publishService.createPublishRun({
      dispatchId: "dispatch-1",
      threadId: "thread-1",
      repoId: "repo-1",
      branchName: "aria/thread/thread-1",
      remoteName: "origin",
    });
    const completedPublishRun = publishService.completePublishRun({
      publishRunId: publishRun.publishRunId,
      status: "pr_created",
      commitSha: "abc123",
      prUrl: "https://example.com/pr/1",
    });

    expect(completedPublishRun.status).toBe("pr_created");
    expect(repository.getPublishRun(publishRun.publishRunId)?.prUrl).toBe("https://example.com/pr/1");
  });

  test("handoff materialization creates a thread, job, and queued dispatch idempotently", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-handoff-materialize-"));
    const dbPath = join(dir, "aria.db");
    const store = new ProjectsEngineStore(dbPath);
    await store.init();
    closers.push(() => store.close());
    const repository = new ProjectsEngineRepository(store);
    const handoffService = await createHandoffService(dbPath);
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-2",
      name: "Aria",
      slug: "aria-handoff",
      description: null,
      createdAt: now,
      updatedAt: now,
    });

    handoffService.submit("handoff-1", {
      idempotencyKey: "handoff-key",
      sourceKind: "local_session",
      projectId: "project-2",
      payloadJson: JSON.stringify({
        title: "Imported handoff thread",
        body: "Please continue this tracked work.",
        requestedBackend: "codex",
      }),
    }, now);

    const first = handoffService.materialize("handoff-1", repository, now + 1);
    const second = handoffService.materialize("handoff-1", repository, now + 2);

    expect(first.dispatchId).toBe("dispatch:handoff-1");
    expect(second.dispatchId).toBe(first.dispatchId);
    expect(repository.getThread(first.threadId)?.title).toBe("Imported handoff thread");
    expect(repository.listJobs(first.threadId)).toHaveLength(1);
    expect(repository.getDispatch(first.dispatchId)?.status).toBe("queued");
    expect(handoffService.get("handoff-1")?.createdDispatchId).toBe(first.dispatchId);
  });

  test("workflow services throw on missing records", async () => {
    const repository = await createProjectsRepository();

    expect(() =>
      new ProjectsReviewService(repository).resolveReview({
        reviewId: "missing-review",
        status: "approved",
      }),
    ).toThrow("Review not found: missing-review");

    expect(() =>
      new ProjectsPublishService(repository).completePublishRun({
        publishRunId: "missing-publish",
        status: "failed",
      }),
    ).toThrow("Publish run not found: missing-publish");

    expect(() => new ProjectsWorktreeService(repository).markRetained("missing-worktree")).toThrow(
      "Worktree not found: missing-worktree",
    );
    expect(() => new ProjectsWorktreeService(repository).markPruned("missing-worktree")).toThrow(
      "Worktree not found: missing-worktree",
    );
  });

  test("handoff materialization rejects unknown projects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-handoff-missing-project-"));
    const dbPath = join(dir, "aria.db");
    const store = new ProjectsEngineStore(dbPath);
    await store.init();
    closers.push(() => store.close());
    const repository = new ProjectsEngineRepository(store);
    const handoffService = await createHandoffService(dbPath);

    handoffService.submit("handoff-missing", {
      idempotencyKey: "handoff-missing-key",
      sourceKind: "local_session",
      projectId: "missing-project",
      payloadJson: "{\"body\":\"hello\"}",
    });

    expect(() => handoffService.materialize("handoff-missing", repository)).toThrow(
      "Project not found: missing-project",
    );
  });
});
