import { ProjectsDispatchService } from "./dispatch.js";
import type { DispatchExecutionEvent } from "./bridge.js";
import type { ProjectsEngineRepository } from "@aria/projects";
import type {
  RuntimeBackendAdapter,
  RuntimeBackendExecutionEvent,
} from "@aria/agents-coding";
import type { EngineRuntime } from "../../runtime/src/runtime.js";
import { createRuntimeBackendRegistry } from "../../runtime/src/backend-registry.js";

function buildDispatchPrompt(repository: ProjectsEngineRepository, dispatchId: string): string {
  const dispatch = repository.getDispatch(dispatchId);
  if (!dispatch) {
    throw new Error(`Dispatch not found: ${dispatchId}`);
  }
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
    task?.description ? `Task description:\n${task.description}` : "",
    jobs.length > 0 ? `Jobs:\n${jobs.map((job) => `- [${job.author}] ${job.body}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

function mapResultToEvent(
  dispatchId: string,
  executionSessionId: string,
  result: { status: string; summary?: string | null; stderr?: string | null },
): DispatchExecutionEvent {
  const type = result.status === "succeeded"
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
    error: result.status === "succeeded" ? null : result.stderr ?? null,
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
      type: event.status === "succeeded"
        ? "execution.completed"
        : event.status === "cancelled"
          ? "execution.cancelled"
          : "execution.failed",
      dispatchId,
      executionSessionId: event.executionId,
      occurredAt: event.timestamp,
      summary: event.summary ?? null,
      error: event.status === "succeeded" ? null : event.summary ?? null,
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

  const executionSessionId = backendId === "aria"
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
    result = await backend.execute({
      executionId: executionSessionId,
      prompt: buildDispatchPrompt(repository, dispatchId),
      workingDirectory: launch.worktreePath ?? process.cwd(),
      timeoutMs: 10 * 60 * 1000,
      approvalMode: "gated",
      sessionId: backendId === "aria" ? executionSessionId : null,
      threadId: launch.threadId,
      taskId: launch.taskId ?? null,
      metadata: { dispatchId },
    }, {
      onEvent: async (event) => {
        const mapped = mapBackendEventToDispatchEvent(dispatchId, event);
        if (mapped) {
          dispatchService.applyExecutionEvent(mapped);
        }
      },
    });

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
