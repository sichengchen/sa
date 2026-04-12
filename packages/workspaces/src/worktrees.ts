import type { WorktreeRecord } from "./types.js";
import type { ProjectsEngineRepository } from "../../projects/src/repository.js";

export function sanitizeWorktreeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function buildBranchName(threadId: string): string {
  return `aria/thread/${sanitizeWorktreeSegment(threadId)}`;
}

export class ProjectsWorktreeService {
  constructor(private readonly repository: ProjectsEngineRepository) {}

  registerWorktree(worktree: WorktreeRecord): void {
    this.repository.upsertWorktree(worktree);
  }

  markRetained(worktreeId: string, expiresAt?: number | null): void {
    const existing = this.repository.getWorktree(worktreeId);
    if (!existing) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }
    this.repository.upsertWorktree({
      ...existing,
      status: "retained",
      expiresAt: expiresAt ?? existing.expiresAt ?? null,
    });
  }

  markPruned(worktreeId: string, prunedAt = Date.now()): void {
    const existing = this.repository.getWorktree(worktreeId);
    if (!existing) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }
    this.repository.upsertWorktree({
      ...existing,
      status: "pruned",
      prunedAt,
    });
  }
}
