import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  buildExternalRefId,
  createExternalRefRecord,
  createLegacyLinearThreadExternalRefs,
  findThreadRefsByLinearIssueId,
  ProjectsEngineRepository,
  ProjectsEngineStore,
  ProjectsPublishService,
  ProjectsReviewService,
  ProjectsThreadEnvironmentService,
  type ThreadEnvironmentBindingRecord,
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
  test("thread environment bindings persist active environment history", async () => {
    const repository = await createProjectsRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-bindings",
      name: "Aria",
      slug: "aria-bindings",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-binding",
      projectId: "project-bindings",
      taskId: null,
      repoId: null,
      title: "Binding thread",
      status: "idle",
      threadType: "local_project",
      workspaceId: "workspace-local",
      environmentId: "env-main",
      environmentBindingId: "binding-1",
      agentId: "codex",
      createdAt: now,
      updatedAt: now,
    });

    repository.upsertThreadEnvironmentBinding({
      bindingId: "binding-1",
      threadId: "thread-binding",
      projectId: "project-bindings",
      workspaceId: "workspace-local",
      environmentId: "env-main",
      attachedAt: now,
      detachedAt: null,
      isActive: true,
      reason: "Initial local main binding",
    });
    repository.upsertThreadEnvironmentBinding({
      bindingId: "binding-2",
      threadId: "thread-binding",
      projectId: "project-bindings",
      workspaceId: "workspace-local",
      environmentId: "env-worktree",
      attachedAt: now + 1,
      detachedAt: null,
      isActive: true,
      reason: "Switch to worktree",
    });

    expect(
      repository
        .listThreadEnvironmentBindings("thread-binding")
        .map((binding) => binding.bindingId),
    ).toEqual(["binding-2", "binding-1"]);
    expect(repository.getActiveThreadEnvironmentBinding("thread-binding")).toMatchObject({
      bindingId: "binding-2",
      environmentId: "env-worktree",
      isActive: true,
    });
  });

  test("thread environment service switches bindings durably through projects control", async () => {
    const repository = await createProjectsRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-switch",
      name: "Aria",
      slug: "aria-switch",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertServer({
      serverId: "server-home",
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
      serverId: "server-home",
      label: "Home Server",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertEnvironment({
      environmentId: "env-local",
      workspaceId: "workspace-local",
      projectId: "project-switch",
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
      projectId: "project-switch",
      label: "Home Server / wt/review",
      mode: "remote",
      kind: "worktree",
      locator: "ssh://aria/review",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-switch",
      projectId: "project-switch",
      taskId: null,
      repoId: null,
      title: "Switchable thread",
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
      threadId: "thread-switch",
      projectId: "project-switch",
      workspaceId: "workspace-local",
      environmentId: "env-local",
      attachedAt: now,
      detachedAt: null,
      isActive: true,
      reason: "Initial local binding",
    });

    const switched = new ProjectsThreadEnvironmentService(repository).switchThreadEnvironment(
      {
        bindingId: "binding-remote",
        threadId: "thread-switch",
        environmentId: "env-remote",
        reason: "Switch to remote review",
      },
      now + 1,
    );

    expect(switched.thread.threadType).toBe("remote_project");
    expect(switched.thread.workspaceId).toBe("workspace-remote");
    expect(switched.thread.environmentId).toBe("env-remote");
    expect(switched.thread.environmentBindingId).toBe("binding-remote");
    expect(switched.activeBinding).toMatchObject({
      bindingId: "binding-remote",
      environmentId: "env-remote",
      workspaceId: "workspace-remote",
      isActive: true,
    });
    expect(switched.history.map((binding) => binding.bindingId)).toEqual([
      "binding-remote",
      "binding-local",
    ]);
    expect(switched.history[1]).toMatchObject({
      bindingId: "binding-local",
      isActive: false,
      detachedAt: now + 1,
    });
  });

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
    expect(repository.getPublishRun(publishRun.publishRunId)?.prUrl).toBe(
      "https://example.com/pr/1",
    );
  });

  test("external ref helpers preserve legacy linear thread lookup behavior", async () => {
    const repository = await createProjectsRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-refs",
      name: "Aria",
      slug: "aria-refs",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-linear",
      projectId: "project-refs",
      taskId: null,
      repoId: null,
      title: "Linear-linked thread",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    const refs = createLegacyLinearThreadExternalRefs({
      projectId: "project-refs",
      threadId: "thread-linear",
      linearIssueId: "ARI-101",
      linearIdentifier: "ARIA-101",
      linearSessionId: "session-linear",
      metadataJson: '{"source":"test"}',
      createdAt: now,
      updatedAt: now,
    });

    for (const ref of refs) {
      repository.upsertExternalRef(ref);
    }

    const direct = createExternalRefRecord({
      ownerType: "thread",
      ownerId: "thread-linear",
      system: "linear",
      externalId: "ARI-102",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertExternalRef(direct);

    expect(buildExternalRefId("thread", "thread-linear", "linear", "ARI-101")).toBe(
      "thread:thread-linear:linear:ARI-101",
    );
    expect(
      findThreadRefsByLinearIssueId(repository, "ARI-101").map((ref) => ref.externalId),
    ).toEqual(["ARI-101"]);
    expect(
      findThreadRefsByLinearIssueId(repository, "ARIA-101").map((ref) => ref.externalId),
    ).toEqual(["ARIA-101"]);
    expect(
      findThreadRefsByLinearIssueId(repository, "ARI-102").map((ref) => ref.externalRefId),
    ).toEqual([direct.externalRefId]);
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

    handoffService.submit(
      "handoff-1",
      {
        idempotencyKey: "handoff-key",
        sourceKind: "local_session",
        projectId: "project-2",
        payloadJson: JSON.stringify({
          title: "Imported handoff thread",
          body: "Please continue this tracked work.",
          workspaceId: "workspace-local",
          environmentId: "env-main",
          requestedBackend: "codex",
        }),
      },
      now,
    );

    const first = handoffService.materialize("handoff-1", repository, now + 1);
    const second = handoffService.materialize("handoff-1", repository, now + 2);

    expect(first.dispatchId).toBe("dispatch:handoff-1");
    expect(second.dispatchId).toBe(first.dispatchId);
    expect(repository.getThread(first.threadId)?.title).toBe("Imported handoff thread");
    expect(repository.getThread(first.threadId)?.threadType).toBe("local_project");
    expect(repository.getThread(first.threadId)?.agentId).toBe("codex");
    expect(repository.getThread(first.threadId)?.workspaceId).toBe("workspace-local");
    expect(repository.getThread(first.threadId)?.environmentId).toBe("env-main");
    expect(repository.getActiveThreadEnvironmentBinding(first.threadId)).toMatchObject({
      bindingId: "binding:handoff-1",
      workspaceId: "workspace-local",
      environmentId: "env-main",
      isActive: true,
    });
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
      payloadJson: '{"body":"hello"}',
    });

    expect(() => handoffService.materialize("handoff-missing", repository)).toThrow(
      "Project not found: missing-project",
    );
  });

  test("thread environment bindings persist active history and thread metadata", async () => {
    const repository = await createProjectsRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-binding",
      name: "Binding project",
      slug: "binding-project",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-binding",
      projectId: "project-binding",
      taskId: null,
      repoId: null,
      title: "Environment tracked thread",
      status: "queued",
      threadType: "local_project",
      workspaceId: "workspace-1",
      environmentId: "env-2",
      environmentBindingId: "binding-2",
      agentId: "codex",
      createdAt: now,
      updatedAt: now,
    });

    const firstBinding: ThreadEnvironmentBindingRecord = {
      bindingId: "binding-1",
      threadId: "thread-binding",
      projectId: "project-binding",
      workspaceId: "workspace-1",
      environmentId: "env-1",
      attachedAt: now - 20,
      detachedAt: null,
      isActive: false,
      reason: "initial checkout",
    };
    const secondBinding: ThreadEnvironmentBindingRecord = {
      bindingId: "binding-2",
      threadId: "thread-binding",
      projectId: "project-binding",
      workspaceId: "workspace-1",
      environmentId: "env-2",
      attachedAt: now - 10,
      detachedAt: null,
      isActive: true,
      reason: "switched to feature worktree",
    };

    repository.upsertThreadEnvironmentBinding(firstBinding);
    repository.upsertThreadEnvironmentBinding(secondBinding);

    expect(repository.getThread("thread-binding")).toMatchObject({
      workspaceId: "workspace-1",
      environmentId: "env-2",
      environmentBindingId: "binding-2",
    });
    expect(repository.getActiveThreadEnvironmentBinding("thread-binding")).toMatchObject(
      secondBinding,
    );
    expect(repository.listThreadEnvironmentBindings("thread-binding")).toEqual([
      secondBinding,
      firstBinding,
    ]);

    repository.upsertThreadEnvironmentBinding({
      bindingId: "binding-3",
      threadId: "thread-binding",
      projectId: "project-binding",
      workspaceId: "workspace-1",
      environmentId: "env-3",
      attachedAt: now,
      detachedAt: null,
      isActive: true,
      reason: "rebound to current workspace",
    });

    expect(repository.getActiveThreadEnvironmentBinding("thread-binding")).toMatchObject({
      bindingId: "binding-3",
      threadId: "thread-binding",
      projectId: "project-binding",
      workspaceId: "workspace-1",
      environmentId: "env-3",
      isActive: true,
    });
    expect(repository.listThreadEnvironmentBindings("thread-binding")).toEqual([
      expect.objectContaining({
        bindingId: "binding-3",
        isActive: true,
        detachedAt: null,
      }),
      expect.objectContaining({
        bindingId: "binding-2",
        isActive: false,
        detachedAt: now,
      }),
      expect.objectContaining({
        bindingId: "binding-1",
        isActive: false,
        detachedAt: null,
      }),
    ]);
  });

  test("server, workspace, and environment records persist the target execution hierarchy", async () => {
    const repository = await createProjectsRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-hierarchy",
      name: "Aria",
      slug: "aria-hierarchy",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertServer({
      serverId: "server-home",
      label: "Home Server",
      primaryBaseUrl: "https://aria.example.test",
      secondaryBaseUrl: "https://gateway.example.test/home",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertWorkspace({
      workspaceId: "workspace-home",
      host: "aria_server",
      serverId: "server-home",
      label: "Home Workspace",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertEnvironment({
      environmentId: "environment-sandbox",
      workspaceId: "workspace-home",
      projectId: "project-hierarchy",
      label: "sandbox/pr-128",
      mode: "remote",
      kind: "sandbox",
      locator: "sandbox/pr-128",
      createdAt: now,
      updatedAt: now,
    });

    expect(repository.getServer("server-home")).toMatchObject({
      label: "Home Server",
      secondaryBaseUrl: "https://gateway.example.test/home",
    });
    expect(repository.listWorkspaces("server-home")).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-home",
        host: "aria_server",
      }),
    ]);
    expect(repository.listEnvironments("project-hierarchy", "workspace-home")).toEqual([
      expect.objectContaining({
        environmentId: "environment-sandbox",
        mode: "remote",
        kind: "sandbox",
        locator: "sandbox/pr-128",
      }),
    ]);
  });
});
