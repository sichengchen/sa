import { ThreadStatusSchema, ThreadTypeSchema } from "@aria/protocol";
import type {
  ThreadStatus as ProtocolThreadStatus,
  ThreadType as ProtocolThreadType,
} from "@aria/protocol";

export type ProjectsExternalSystem = "linear" | "github" | "git" | "unknown";

export interface ProjectRecord {
  projectId: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type WorkspaceHost = "desktop_local" | "aria_server";

export interface ServerRecord {
  serverId: string;
  label: string;
  primaryBaseUrl?: string | null;
  secondaryBaseUrl?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceRecord {
  workspaceId: string;
  host: WorkspaceHost;
  serverId?: string | null;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export type EnvironmentMode = "local" | "remote";
export type EnvironmentKind = "main" | "worktree" | "sandbox";

export interface EnvironmentRecord {
  environmentId: string;
  workspaceId: string;
  projectId: string;
  label: string;
  mode: EnvironmentMode;
  kind: EnvironmentKind;
  locator: string;
  createdAt: number;
  updatedAt: number;
}

export type TaskStatus = "backlog" | "ready" | "in_progress" | "blocked" | "done" | "cancelled";

export interface TaskRecord {
  taskId: string;
  projectId: string;
  repoId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
}

export const THREAD_STATUSES = ThreadStatusSchema.options;
export type ThreadStatus = ProtocolThreadStatus;
export const THREAD_TYPES = ThreadTypeSchema.options;
export type ThreadType = ProtocolThreadType;
export type AgentAdapterId = "aria-agent" | "codex" | "claude-code" | "opencode" | string;

export interface ThreadRecord {
  threadId: string;
  projectId: string;
  taskId?: string | null;
  repoId?: string | null;
  title: string;
  status: ThreadStatus;
  threadType?: ThreadType | null;
  workspaceId?: string | null;
  environmentId?: string | null;
  environmentBindingId?: string | null;
  agentId?: AgentAdapterId | null;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadEnvironmentBindingRecord {
  bindingId: string;
  threadId: string;
  projectId: string;
  workspaceId: string;
  environmentId: string;
  attachedAt: number;
  detachedAt?: number | null;
  isActive: boolean;
  reason?: string | null;
}

export interface SessionRecord {
  sessionId: string;
  threadId: string;
  threadType: ThreadType;
  workspaceId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  agentId?: AgentAdapterId | null;
  createdAt: number;
  lastActiveAt: number;
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface RunRecord {
  runId: string;
  sessionId: string;
  threadId: string;
  threadType: ThreadType;
  workspaceId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  jobId?: string | null;
  agentId?: AgentAdapterId | null;
  status: RunStatus;
  createdAt: number;
  completedAt?: number | null;
}

export type { DispatchRecord, DispatchStatus, JobAuthor, JobRecord } from "@aria/jobs/types";

export type { RepoRecord, WorktreeRecord, WorktreeStatus } from "@aria/workspaces/types";

export type ReviewStatus = "pending" | "changes_requested" | "approved" | "dismissed";

export interface ReviewRecord {
  reviewId: string;
  dispatchId: string;
  threadId: string;
  reviewType: "self" | "human" | "external";
  status: ReviewStatus;
  summary?: string | null;
  artifactJson?: string | null;
  createdAt: number;
  resolvedAt?: number | null;
}

export type PublishRunStatus =
  | "pending"
  | "pushed"
  | "pr_created"
  | "merged"
  | "failed"
  | "cancelled";

export interface PublishRunRecord {
  publishRunId: string;
  dispatchId: string;
  threadId: string;
  repoId: string;
  branchName: string;
  remoteName: string;
  status: PublishRunStatus;
  commitSha?: string | null;
  prUrl?: string | null;
  metadataJson?: string | null;
  createdAt: number;
  completedAt?: number | null;
}

export interface ExternalRefRecord {
  externalRefId: string;
  ownerType: "project" | "task" | "thread" | "review" | "publish_run";
  ownerId: string;
  system: ProjectsExternalSystem;
  externalId: string;
  externalKey?: string | null;
  sessionId?: string | null;
  metadataJson?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentAdapterRecord {
  agentId: AgentAdapterId;
  label: string;
  threadTypes: ThreadType[];
  host: WorkspaceHost | "shared";
}

export interface AutomationRecord {
  automationId: string;
  threadId: string;
  scheduleLabel: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryRecord {
  memoryRecordId: string;
  threadId?: string | null;
  summary: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConnectorAccountRecord {
  connectorAccountId: string;
  connectorType:
    | ProjectsExternalSystem
    | "slack"
    | "telegram"
    | "discord"
    | "teams"
    | "gchat"
    | "wechat";
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApprovalRecord {
  approvalId: string;
  threadId: string;
  runId?: string | null;
  summary: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: number;
  resolvedAt?: number | null;
}

export interface AuditEventRecord {
  auditEventId: string;
  threadId?: string | null;
  runId?: string | null;
  actorId?: string | null;
  kind: string;
  payloadJson?: string | null;
  createdAt: number;
}

export interface CheckpointRecord {
  checkpointId: string;
  threadId: string;
  runId?: string | null;
  path: string;
  createdAt: number;
}

const DEFAULT_THREAD_TYPE: ThreadType = "remote_project";

const THREAD_TYPE_LABELS: Record<ThreadType, string> = {
  aria: "Aria",
  connector: "Connector",
  automation: "Automation",
  remote_project: "Remote Project",
  local_project: "Local Project",
};

export function resolveThreadType(
  thread: Pick<ThreadRecord, "threadType">,
  fallback: ThreadType = DEFAULT_THREAD_TYPE,
): ThreadType {
  return thread.threadType ?? fallback;
}

export function describeThreadType(threadType: ThreadType): string {
  return THREAD_TYPE_LABELS[threadType];
}
