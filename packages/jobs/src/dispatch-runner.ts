import { ProjectsDispatchService } from "./dispatch.js";
import { createRuntimeBackendRegistry } from "./backend-registry.js";
import type { DispatchExecutionEvent } from "./bridge.js";
import type { ProjectsEngineRepository } from "@aria/projects";
import type { RuntimeBackendAdapter, RuntimeBackendExecutionEvent } from "@aria/agents-coding";
import type { EngineRuntime } from "@aria/server/runtime";

function buildDispatchPrompt(repository: ProjectsEngineRepository, dispatchId: string): string {
  const dispatch = repository.getDispatch(dispatchId);
  if (!dispatch) {
    throw new Error(`Dispatch not found: ${dispatchId}`);
  }

  const launch = new ProjectsDispatchService(repository).buildLaunchRequest(dispatchId);
  const thread = repository.getThread(dispatch.threadId);
  const task = dispatch.taskId
    ? repository.getTask(dispatch.taskId)
    : thread?.taskId
      ? repository.getTask(thread.taskId)
      : undefined;
  const jobs = repository.listJobs(dispatch.threadId);

  return [
    task ? `Task: ${task.title}` : "",
    thread ? `Thread: ${thread.title}` : "",
    launch.threadType ? `Thread type: ${launch.threadType}` : "",
    launch.workspaceId ? `Workspace: ${launch.workspaceId}` : "",
    launch.environmentId ? `Environment: ${launch.environmentId}` : "",
    launch.environmentBindingId ? `Environment binding: ${launch.environmentBindingId}` : "",
    task?.description ? `Task description:\n${task.description}` : "",
    jobs.length > 0
      ? `Jobs:\n${jobs.map((job) => `- [${job.author}] ${job.body}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDispatchMetadata(
  launch: ReturnType<ProjectsDispatchService["buildLaunchRequest"]>,
): Record<string, string> {
  const metadata: Record<string, string> = {
    dispatchId: launch.dispatchId,
    projectId: launch.projectId,
    threadId: launch.threadId,
  };

  if (launch.taskId) metadata.taskId = launch.taskId;
  if (launch.jobId) metadata.jobId = launch.jobId;
  if (launch.repoId) metadata.repoId = launch.repoId;
  if (launch.threadType) metadata.threadType = launch.threadType;
  if (launch.workspaceId) metadata.workspaceId = launch.workspaceId;
  if (launch.environmentId) metadata.environmentId = launch.environmentId;
  if (launch.environmentBindingId) metadata.environmentBindingId = launch.environmentBindingId;
  if (launch.agentId) metadata.agentId = launch.agentId;
  if (launch.worktreeId) metadata.worktreeId = launch.worktreeId;

  return metadata;
}

function mapResultToEvent(
  dispatchId: string,
  executionSessionId: string,
  result: { status: string; summary?: string | null; stderr?: string | null },
): DispatchExecutionEvent {
  const type =
    result.status === "succeeded"
      ? "execution.completed"
      : result.status === "cancelled"
        ? "execution.cancelled"
        : "execution.failed";
  return {
    type,
    dispatchId,
    executionSessionId,
    occurredAt: Date.now(),
    summary: result.summary ?? null,
    error: result.status === "succeeded" ? null : (result.stderr ?? null),
  };
}

function mapBackendEventToDispatchEvent(
  dispatchId: string,
  event: RuntimeBackendExecutionEvent,
): DispatchExecutionEvent | null {
  if (event.type === "execution.started") {
    return {
      type: "execution.running",
      dispatchId,
      executionSessionId: event.executionId,
      occurredAt: event.timestamp,
      summary: null,
      error: null,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
    };
  }

  if (event.type === "execution.waiting_approval") {
    return {
      type: "execution.waiting_approval",
      dispatchId,
      executionSessionId: event.executionId,
      occurredAt: event.timestamp,
      summary: null,
      error: null,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
    };
  }

  if (event.type === "execution.completed") {
    return {
      type:
        event.status === "succeeded"
          ? "execution.completed"
          : event.status === "cancelled"
            ? "execution.cancelled"
            : "execution.failed",
      dispatchId,
      executionSessionId: event.executionId,
      occurredAt: event.timestamp,
      summary: event.summary ?? null,
      error: event.status === "succeeded" ? null : (event.summary ?? null),
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
    };
  }

  return null;
}

export interface RunDispatchExecutionOptions {
  backendRegistry?: Map<string, RuntimeBackendAdapter>;
}

export async function runDispatchExecution(
  runtime: EngineRuntime,
  repository: ProjectsEngineRepository,
  dispatchId: string,
  options: RunDispatchExecutionOptions = {},
): Promise<{ executionSessionId: string; status: string; summary?: string | null }> {
  const dispatchService = new ProjectsDispatchService(repository);
  const launch = dispatchService.buildLaunchRequest(dispatchId);
  const backendRegistry = options.backendRegistry ?? createRuntimeBackendRegistry(runtime);
  const backendId = launch.requestedBackend ?? "aria";
  const backend = backendRegistry.get(backendId);
  if (!backend) {
    throw new Error(`Runtime backend not found: ${backendId}`);
  }

  const executionSessionId =
    backendId === "aria"
      ? runtime.sessions.create(`dispatch:${dispatchId}`, "engine").id
      : `${backendId}:${dispatchId}`;

  dispatchService.acceptDispatch({
    dispatchId,
    executionSessionId,
    acceptedAt: Date.now(),
    effectiveBackend: backendId,
    effectiveModel: launch.requestedModel ?? null,
  });

  let result;
  try {
    result = await backend.execute(
      {
        executionId: executionSessionId,
        prompt: buildDispatchPrompt(repository, dispatchId),
        workingDirectory: launch.worktreePath ?? process.cwd(),
        timeoutMs: 10 * 60 * 1000,
        approvalMode: "gated",
        sessionId: backendId === "aria" ? executionSessionId : null,
        threadId: launch.threadId,
        taskId: launch.taskId ?? null,
        metadata: buildDispatchMetadata(launch),
      },
      {
        onEvent: async (event) => {
          const mapped = mapBackendEventToDispatchEvent(dispatchId, event);
          if (mapped) {
            dispatchService.applyExecutionEvent(mapped);
          }
        },
      },
    );

    dispatchService.applyExecutionEvent(
      mapResultToEvent(dispatchId, executionSessionId, {
        status: result.status,
        summary: result.summary ?? null,
        stderr: result.stderr ?? null,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dispatchService.applyExecutionEvent({
      type: "execution.failed",
      dispatchId,
      executionSessionId,
      occurredAt: Date.now(),
      summary: null,
      error: message,
    });
    throw error;
  }

  return {
    executionSessionId,
    status: result.status,
    summary: result.summary ?? null,
  };
}
