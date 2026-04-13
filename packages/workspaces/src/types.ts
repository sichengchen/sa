export interface RepoRecord {
  repoId: string;
  projectId: string;
  name: string;
  remoteUrl: string;
  defaultBranch: string;
  createdAt: number;
  updatedAt: number;
}

export type WorktreeStatus = "active" | "retained" | "pruned" | "failed";

export interface WorktreeRecord {
  worktreeId: string;
  repoId: string;
  threadId?: string | null;
  dispatchId?: string | null;
  path: string;
  branchName: string;
  baseRef: string;
  status: WorktreeStatus;
  createdAt: number;
  expiresAt?: number | null;
  prunedAt?: number | null;
}
