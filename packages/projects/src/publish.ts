import { randomUUID } from "node:crypto";
import type { ProjectsEngineRepository } from "./repository.js";
import type { PublishRunRecord } from "./types.js";

export interface CreatePublishRunInput {
  publishRunId?: string;
  dispatchId: string;
  threadId: string;
  repoId: string;
  branchName: string;
  remoteName: string;
  metadataJson?: string | null;
}

export interface CompletePublishRunInput {
  publishRunId: string;
  status: PublishRunRecord["status"];
  commitSha?: string | null;
  prUrl?: string | null;
  metadataJson?: string | null;
}

export class ProjectsPublishService {
  constructor(private readonly repository: ProjectsEngineRepository) {}

  createPublishRun(input: CreatePublishRunInput, now = Date.now()): PublishRunRecord {
    const publishRun: PublishRunRecord = {
      publishRunId: input.publishRunId ?? randomUUID(),
      dispatchId: input.dispatchId,
      threadId: input.threadId,
      repoId: input.repoId,
      branchName: input.branchName,
      remoteName: input.remoteName,
      status: "pending",
      commitSha: null,
      prUrl: null,
      metadataJson: input.metadataJson ?? null,
      createdAt: now,
      completedAt: null,
    };
    this.repository.upsertPublishRun(publishRun);
    return publishRun;
  }

  completePublishRun(input: CompletePublishRunInput, now = Date.now()): PublishRunRecord {
    const existing = this.repository.getPublishRun(input.publishRunId);
    if (!existing) {
      throw new Error(`Publish run not found: ${input.publishRunId}`);
    }

    const updated: PublishRunRecord = {
      ...existing,
      status: input.status,
      commitSha: input.commitSha ?? existing.commitSha ?? null,
      prUrl: input.prUrl ?? existing.prUrl ?? null,
      metadataJson: input.metadataJson ?? existing.metadataJson ?? null,
      completedAt: now,
    };
    this.repository.upsertPublishRun(updated);
    return updated;
  }

  listPublishRuns(threadId?: string, dispatchId?: string): PublishRunRecord[] {
    return this.repository.listPublishRuns(threadId, dispatchId);
  }
}
