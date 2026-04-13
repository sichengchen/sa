export type JobAuthor = "user" | "agent" | "system" | "external";

export interface JobRecord {
  jobId: string;
  threadId: string;
  author: JobAuthor;
  body: string;
  createdAt: number;
}

export type DispatchStatus =
  | "queued"
  | "accepted"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface DispatchRecord {
  dispatchId: string;
  projectId: string;
  taskId?: string | null;
  threadId: string;
  jobId?: string | null;
  repoId?: string | null;
  worktreeId?: string | null;
  status: DispatchStatus;
  requestedBackend?: string | null;
  requestedModel?: string | null;
  executionSessionId?: string | null;
  summary?: string | null;
  error?: string | null;
  createdAt: number;
  acceptedAt?: number | null;
  completedAt?: number | null;
}
