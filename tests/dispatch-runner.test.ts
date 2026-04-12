import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { runDispatchExecution } from "@aria/jobs";
import { ProjectsEngineRepository, ProjectsEngineStore } from "@aria/projects";
import type {
  RuntimeBackendAdapter,
  RuntimeBackendExecutionObserver,
  RuntimeBackendExecutionRequest,
  RuntimeBackendExecutionResult,
} from "@aria/agents-coding";

const stores: ProjectsEngineStore[] = [];

async function createRepository(): Promise<ProjectsEngineRepository> {
  const home = await mkdtemp(join(tmpdir(), "aria-dispatch-runner-"));
  const store = new ProjectsEngineStore(join(home, "aria.db"));
  await store.init();
  stores.push(store);
  return new ProjectsEngineRepository(store);
}

function createFakeBackend(options: {
  execute(
    request: RuntimeBackendExecutionRequest,
    observer?: RuntimeBackendExecutionObserver,
  ): Promise<RuntimeBackendExecutionResult>;
}): RuntimeBackendAdapter {
  return {
    backend: "fake",
    displayName: "Fake Backend",
    capabilities: {
      supportsStreamingEvents: true,
      supportsCancellation: true,
      supportsStructuredOutput: true,
      supportsFileEditing: true,
      supportsBackgroundExecution: false,
      supportsAuthProbe: false,
    },
    async probeAvailability() {
      return {
        available: true,
        authState: "configured",
        detectedVersion: "test",
        reason: null,
      };
    },
    execute: options.execute,
    async cancel() {},
  };
}

afterEach(() => {
  while (stores.length > 0) {
    stores.pop()?.close();
  }
});

describe("runDispatchExecution", () => {
  test("propagates running, waiting approval, and completion back into Projects Engine", async () => {
    const repository = await createRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-1",
      name: "Aria",
      slug: "aria",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertTask({
      taskId: "task-1",
      projectId: "project-1",
      repoId: null,
      title: "Implement dispatch runner",
      description: "Add runtime-backed execution",
      status: "ready",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-1",
      projectId: "project-1",
      taskId: "task-1",
      repoId: null,
      title: "Dispatch execution",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertDispatch({
      dispatchId: "dispatch-1",
      projectId: "project-1",
      taskId: "task-1",
      threadId: "thread-1",
      jobId: null,
      repoId: null,
      worktreeId: null,
      status: "queued",
      requestedBackend: "fake",
      requestedModel: null,
      executionSessionId: null,
      summary: null,
      error: null,
      createdAt: now,
      acceptedAt: null,
      completedAt: null,
    });

    const backend = createFakeBackend({
      async execute(request, observer) {
        await observer?.onEvent?.({
          type: "execution.started",
          backend: "fake",
          executionId: request.executionId,
          timestamp: now + 1,
          metadata: request.metadata,
        });
        expect(repository.getDispatch("dispatch-1")?.status).toBe("running");

        await observer?.onEvent?.({
          type: "execution.waiting_approval",
          backend: "fake",
          executionId: request.executionId,
          timestamp: now + 2,
          metadata: {
            ...(request.metadata ?? {}),
            toolCallId: "tool-1",
          },
        });
        expect(repository.getDispatch("dispatch-1")?.status).toBe("waiting_approval");

        await observer?.onEvent?.({
          type: "execution.completed",
          backend: "fake",
          executionId: request.executionId,
          timestamp: now + 3,
          status: "succeeded",
          summary: "Completed dispatch run",
          metadata: request.metadata,
        });

        return {
          backend: "fake",
          executionId: request.executionId,
          status: "succeeded",
          exitCode: 0,
          stdout: "done",
          stderr: "",
          summary: "Completed dispatch run",
          filesChanged: [],
          metadata: request.metadata,
        };
      },
    });

    const result = await runDispatchExecution(
      {} as never,
      repository,
      "dispatch-1",
      { backendRegistry: new Map([["fake", backend]]) },
    );

    expect(result.executionSessionId).toBe("fake:dispatch-1");
    expect(result.status).toBe("succeeded");
    expect(result.summary).toBe("Completed dispatch run");

    const dispatch = repository.getDispatch("dispatch-1");
    expect(dispatch?.status).toBe("completed");
    expect(dispatch?.executionSessionId).toBe("fake:dispatch-1");
    expect(dispatch?.summary).toBe("Completed dispatch run");
    expect(dispatch?.acceptedAt).toBeNumber();
    expect(dispatch?.completedAt).toBeNumber();
  });

  test("records failed dispatches when the backend throws", async () => {
    const repository = await createRepository();
    const now = Date.now();

    repository.upsertProject({
      projectId: "project-2",
      name: "Aria",
      slug: "aria-fail",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertThread({
      threadId: "thread-2",
      projectId: "project-2",
      taskId: null,
      repoId: null,
      title: "Failing dispatch",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    repository.upsertDispatch({
      dispatchId: "dispatch-2",
      projectId: "project-2",
      taskId: null,
      threadId: "thread-2",
      jobId: null,
      repoId: null,
      worktreeId: null,
      status: "queued",
      requestedBackend: "fake",
      requestedModel: null,
      executionSessionId: null,
      summary: null,
      error: null,
      createdAt: now,
      acceptedAt: null,
      completedAt: null,
    });

    const backend = createFakeBackend({
      async execute(request, observer) {
        await observer?.onEvent?.({
          type: "execution.started",
          backend: "fake",
          executionId: request.executionId,
          timestamp: now + 1,
          metadata: request.metadata,
        });
        throw new Error("backend exploded");
      },
    });

    await expect(
      runDispatchExecution(
        {} as never,
        repository,
        "dispatch-2",
        { backendRegistry: new Map([["fake", backend]]) },
      ),
    ).rejects.toThrow("backend exploded");

    const dispatch = repository.getDispatch("dispatch-2");
    expect(dispatch?.status).toBe("failed");
    expect(dispatch?.executionSessionId).toBe("fake:dispatch-2");
    expect(dispatch?.error).toBe("backend exploded");
    expect(dispatch?.acceptedAt).toBeNumber();
    expect(dispatch?.completedAt).toBeNumber();
  });
});
