import { ProjectsDispatchService } from "@aria/jobs";
import type { ProjectsEngineRepository } from "@aria/projects";
import type { HandoffRecord, HandoffSubmission } from "./types.js";
import { HandoffStore } from "./store.js";

interface ParsedHandoffPayload {
  title?: string;
  body?: string;
  repoId?: string | null;
  taskId?: string | null;
  threadId?: string | null;
  workspaceId?: string | null;
  environmentId?: string | null;
  agentId?: string | null;
  requestedBackend?: string | null;
  requestedModel?: string | null;
}

function parsePayload(payloadJson?: string | null): ParsedHandoffPayload {
  if (!payloadJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      body: typeof parsed.body === "string" ? parsed.body : payloadJson,
      repoId: typeof parsed.repoId === "string" ? parsed.repoId : null,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : null,
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : null,
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : null,
      environmentId: typeof parsed.environmentId === "string" ? parsed.environmentId : null,
      agentId: typeof parsed.agentId === "string" ? parsed.agentId : null,
      requestedBackend:
        typeof parsed.requestedBackend === "string" ? parsed.requestedBackend : null,
      requestedModel: typeof parsed.requestedModel === "string" ? parsed.requestedModel : null,
    };
  } catch {
    return { body: payloadJson };
  }
}

function resolveProjectThreadType(
  sourceKind: HandoffSubmission["sourceKind"],
): "local_project" | "remote_project" {
  return sourceKind === "local_session" ? "local_project" : "remote_project";
}

export class HandoffService {
  constructor(private readonly store: HandoffStore) {}

  async init(): Promise<void> {
    await this.store.init();
  }

  close(): void {
    this.store.close();
  }

  get(handoffId: string): HandoffRecord | undefined {
    return this.store.getById(handoffId);
  }

  list(projectId?: string): HandoffRecord[] {
    return this.store.list(projectId);
  }

  submit(handoffId: string, submission: HandoffSubmission, now = Date.now()): HandoffRecord {
    const existing = this.store.getByIdempotencyKey(submission.idempotencyKey);
    if (existing) {
      return existing;
    }

    const record: HandoffRecord = {
      handoffId,
      idempotencyKey: submission.idempotencyKey,
      sourceKind: submission.sourceKind,
      sourceSessionId: submission.sourceSessionId ?? null,
      projectId: submission.projectId,
      taskId: submission.taskId ?? null,
      threadId: submission.threadId ?? null,
      createdDispatchId: null,
      status: "pending",
      payloadJson: submission.payloadJson ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.upsert(record);
    return record;
  }

  attachDispatch(handoffId: string, dispatchId: string, now = Date.now()): HandoffRecord {
    const existing = this.store.list().find((record) => record.handoffId === handoffId);
    if (!existing) {
      throw new Error(`Handoff not found: ${handoffId}`);
    }
    const updated: HandoffRecord = {
      ...existing,
      createdDispatchId: dispatchId,
      status: "dispatch_created",
      updatedAt: now,
    };
    this.store.upsert(updated);
    return updated;
  }

  materialize(
    handoffId: string,
    repository: ProjectsEngineRepository,
    now = Date.now(),
  ): { handoff: HandoffRecord; threadId: string; jobId: string; dispatchId: string } {
    const handoff = this.store.getById(handoffId);
    if (!handoff) {
      throw new Error(`Handoff not found: ${handoffId}`);
    }
    if (!repository.getProject(handoff.projectId)) {
      throw new Error(`Project not found: ${handoff.projectId}`);
    }

    if (handoff.createdDispatchId) {
      const existingDispatch = repository.getDispatch(handoff.createdDispatchId);
      if (existingDispatch) {
        return {
          handoff,
          threadId: existingDispatch.threadId,
          jobId: existingDispatch.jobId ?? `job:${handoff.handoffId}`,
          dispatchId: existingDispatch.dispatchId,
        };
      }
    }

    const payload = parsePayload(handoff.payloadJson);
    const threadId = handoff.threadId ?? payload.threadId ?? `thread:${handoff.handoffId}`;
    const taskId = handoff.taskId ?? payload.taskId ?? null;
    const existingThread = repository.getThread(threadId);
    if (!existingThread) {
      repository.upsertThread({
        threadId,
        projectId: handoff.projectId,
        taskId,
        repoId: payload.repoId ?? null,
        title: payload.title ?? `Handoff ${handoff.handoffId}`,
        status: "queued",
        threadType: resolveProjectThreadType(handoff.sourceKind),
        workspaceId: payload.workspaceId ?? null,
        environmentId: payload.environmentId ?? null,
        environmentBindingId: null,
        agentId: payload.agentId ?? payload.requestedBackend ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (payload.workspaceId && payload.environmentId) {
      repository.upsertThreadEnvironmentBinding({
        bindingId: `binding:${handoff.handoffId}`,
        threadId,
        projectId: handoff.projectId,
        workspaceId: payload.workspaceId,
        environmentId: payload.environmentId,
        attachedAt: now,
        detachedAt: null,
        isActive: true,
        reason: `Materialized from ${handoff.sourceKind}`,
      });
    }

    const jobId = `job:${handoff.handoffId}`;
    repository.upsertJob({
      jobId,
      threadId,
      author: "external",
      body: payload.body ?? handoff.payloadJson ?? `Handoff ${handoff.handoffId}`,
      createdAt: now,
    });

    const dispatchId = handoff.createdDispatchId ?? `dispatch:${handoff.handoffId}`;
    const dispatchService = new ProjectsDispatchService(repository);
    dispatchService.queueDispatch({
      dispatchId,
      projectId: handoff.projectId,
      taskId,
      threadId,
      jobId,
      repoId: payload.repoId ?? repository.getThread(threadId)?.repoId ?? null,
      worktreeId: null,
      status: "queued",
      requestedBackend: payload.requestedBackend ?? null,
      requestedModel: payload.requestedModel ?? null,
      executionSessionId: null,
      summary: null,
      error: null,
      createdAt: now,
      acceptedAt: null,
      completedAt: null,
    });
    repository.upsertThread({
      ...(repository.getThread(threadId) ?? {
        threadId,
        projectId: handoff.projectId,
        taskId,
        repoId: payload.repoId ?? null,
        title: payload.title ?? `Handoff ${handoff.handoffId}`,
        threadType: resolveProjectThreadType(handoff.sourceKind),
        workspaceId: payload.workspaceId ?? null,
        environmentId: payload.environmentId ?? null,
        environmentBindingId: null,
        agentId: payload.agentId ?? payload.requestedBackend ?? null,
        createdAt: now,
      }),
      title:
        repository.getThread(threadId)?.title ?? payload.title ?? `Handoff ${handoff.handoffId}`,
      status: "queued",
      threadType:
        repository.getThread(threadId)?.threadType ?? resolveProjectThreadType(handoff.sourceKind),
      workspaceId: repository.getThread(threadId)?.workspaceId ?? payload.workspaceId ?? null,
      environmentId: repository.getThread(threadId)?.environmentId ?? payload.environmentId ?? null,
      environmentBindingId: repository.getThread(threadId)?.environmentBindingId ?? null,
      agentId:
        repository.getThread(threadId)?.agentId ??
        payload.agentId ??
        payload.requestedBackend ??
        null,
      updatedAt: now,
    });

    const updated = this.attachDispatch(handoffId, dispatchId, now);
    return { handoff: updated, threadId, jobId, dispatchId };
  }
}
