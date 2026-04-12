import { randomUUID } from "node:crypto";
import type { ProjectsEngineRepository } from "./repository.js";
import type { ReviewRecord } from "./types.js";

export interface CreateReviewInput {
  reviewId?: string;
  dispatchId: string;
  threadId: string;
  reviewType: ReviewRecord["reviewType"];
  summary?: string | null;
  artifactJson?: string | null;
}

export interface ResolveReviewInput {
  reviewId: string;
  status: ReviewRecord["status"];
  summary?: string | null;
  artifactJson?: string | null;
}

export class ProjectsReviewService {
  constructor(private readonly repository: ProjectsEngineRepository) {}

  createReview(input: CreateReviewInput, now = Date.now()): ReviewRecord {
    const review: ReviewRecord = {
      reviewId: input.reviewId ?? randomUUID(),
      dispatchId: input.dispatchId,
      threadId: input.threadId,
      reviewType: input.reviewType,
      status: "pending",
      summary: input.summary ?? null,
      artifactJson: input.artifactJson ?? null,
      createdAt: now,
      resolvedAt: null,
    };
    this.repository.upsertReview(review);
    return review;
  }

  resolveReview(input: ResolveReviewInput, now = Date.now()): ReviewRecord {
    const existing = this.repository.getReview(input.reviewId);
    if (!existing) {
      throw new Error(`Review not found: ${input.reviewId}`);
    }

    const updated: ReviewRecord = {
      ...existing,
      status: input.status,
      summary: input.summary ?? existing.summary ?? null,
      artifactJson: input.artifactJson ?? existing.artifactJson ?? null,
      resolvedAt: now,
    };
    this.repository.upsertReview(updated);
    return updated;
  }

  listReviews(threadId?: string, dispatchId?: string): ReviewRecord[] {
    return this.repository.listReviews(threadId, dispatchId);
  }
}
