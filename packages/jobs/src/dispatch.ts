import type { ProjectsEngineRepository } from "@aria/projects";
import type { DispatchAccepted, DispatchExecutionEvent, DispatchLaunchRequest } from "./bridge.js";
import type { DispatchRecord } from "./types.js";

export class ProjectsDispatchService {
  constructor(private readonly repository: ProjectsEngineRepository) {}

  private resolveLaunchContext(dispatchId: string) {
    const dispatch = this.repository.getDispatch(dispatchId);
    if (!dispatch) {
      throw new Error(`Dispatch not found: ${dispatchId}`);
    }

    const thread = this.repository.getThread(dispatch.threadId);
    const activeBinding = this.repository.getActiveThreadEnvironmentBinding(dispatch.threadId);
    const worktree = dispatch.worktreeId
      ? this.repository.getWorktree(dispatch.worktreeId)
      : undefined;
    const resolvedWorkspaceId = activeBinding?.workspaceId ?? thread?.workspaceId ?? null;
    const resolvedEnvironmentId = activeBinding?.environmentId ?? thread?.environmentId ?? null;
    const resolvedEnvironmentBindingId =
      activeBinding?.bindingId ?? thread?.environmentBindingId ?? null;

    return {
      dispatch,
      thread,
      activeBinding,
      worktree,
      resolvedWorkspaceId,
      resolvedEnvironmentId,
      resolvedEnvironmentBindingId,
    };
  }

  queueDispatch(record: DispatchRecord): void {
    this.repository.upsertDispatch({ ...record, status: "queued" });
  }

  acceptDispatch(input: DispatchAccepted): void {
    const existing = this.repository.getDispatch(input.dispatchId);
    if (!existing) {
      throw new Error(`Dispatch not found: ${input.dispatchId}`);
    }
    this.repository.upsertDispatch({
      ...existing,
      status: "accepted",
      executionSessionId: input.executionSessionId,
      acceptedAt: input.acceptedAt,
      requestedBackend: input.effectiveBackend ?? existing.requestedBackend,
      requestedModel: input.effectiveModel ?? existing.requestedModel,
    });
  }

  applyExecutionEvent(event: DispatchExecutionEvent): void {
    const existing = this.repository.getDispatch(event.dispatchId);
    if (!existing) {
      throw new Error(`Dispatch not found: ${event.dispatchId}`);
    }

    const status =
      event.type === "execution.running"
        ? "running"
        : event.type === "execution.waiting_approval"
          ? "waiting_approval"
          : event.type === "execution.completed"
            ? "completed"
            : event.type === "execution.failed"
              ? "failed"
              : event.type === "execution.cancelled"
                ? "cancelled"
                : existing.status;

    this.repository.upsertDispatch({
      ...existing,
      status,
      executionSessionId: event.executionSessionId,
      summary: event.summary ?? existing.summary,
      error: event.error ?? existing.error,
      completedAt:
        status === "completed" || status === "failed" || status === "cancelled"
          ? event.occurredAt
          : existing.completedAt,
    });
  }

  buildLaunchRequest(dispatchId: string): DispatchLaunchRequest {
    const {
      dispatch,
      thread,
      worktree,
      resolvedWorkspaceId,
      resolvedEnvironmentId,
      resolvedEnvironmentBindingId,
    } = this.resolveLaunchContext(dispatchId);

    return {
      dispatchId: dispatch.dispatchId,
      projectId: dispatch.projectId,
      taskId: dispatch.taskId,
      threadId: dispatch.threadId,
      threadType: thread?.threadType ?? null,
      jobId: dispatch.jobId,
      repoId: dispatch.repoId,
      workspaceId: resolvedWorkspaceId,
      environmentId: resolvedEnvironmentId,
      environmentBindingId: resolvedEnvironmentBindingId,
      agentId: thread?.agentId ?? null,
      worktreeId: dispatch.worktreeId,
      worktreePath: worktree?.path ?? null,
      requestedBackend: dispatch.requestedBackend,
      requestedModel: dispatch.requestedModel,
    };
  }
}
