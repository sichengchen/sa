import {
  type EnvironmentRecord,
  type ServerRecord,
  type WorkspaceRecord,
  describeThreadType,
  resolveThreadType,
  type ProjectRecord,
  type ThreadRecord,
  type ThreadStatus,
  type ThreadType,
} from "@aria/projects";

export type {
  ProjectRecord,
  TaskRecord,
  TaskStatus,
  ThreadRecord,
  ThreadStatus,
} from "@aria/projects";

export interface ClientProjectThreadSummary {
  projectId: string;
  projectName: string;
  threadId: string;
  threadTitle: string;
  threadStatus: ThreadStatus;
  threadType: ThreadType;
  threadTypeLabel: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  agentId?: string | null;
}

export interface ClientExecutionHierarchySummary {
  serverId?: string | null;
  serverLabel?: string | null;
  workspaceId: string;
  workspaceLabel: string;
  environmentId: string;
  environmentLabel: string;
  environmentMode: EnvironmentRecord["mode"];
  environmentKind: EnvironmentRecord["kind"];
  locator: string;
}

export function buildClientProjectThreadSummary(
  project: Pick<ProjectRecord, "projectId" | "name">,
  thread: Pick<
    ThreadRecord,
    "threadId" | "title" | "status" | "threadType" | "workspaceId" | "environmentId" | "agentId"
  >,
): ClientProjectThreadSummary {
  const threadType = resolveThreadType(thread);
  return {
    projectId: project.projectId,
    projectName: project.name,
    threadId: thread.threadId,
    threadTitle: thread.title,
    threadStatus: thread.status,
    threadType,
    threadTypeLabel: describeThreadType(threadType),
    workspaceId: thread.workspaceId ?? null,
    environmentId: thread.environmentId ?? null,
    agentId: thread.agentId ?? null,
  };
}

export function buildClientExecutionHierarchySummary(
  workspace: Pick<WorkspaceRecord, "workspaceId" | "label" | "serverId">,
  environment: Pick<EnvironmentRecord, "environmentId" | "label" | "mode" | "kind" | "locator">,
  server?: Pick<ServerRecord, "serverId" | "label"> | null,
): ClientExecutionHierarchySummary {
  return {
    serverId: server?.serverId ?? workspace.serverId ?? null,
    serverLabel: server?.label ?? null,
    workspaceId: workspace.workspaceId,
    workspaceLabel: workspace.label,
    environmentId: environment.environmentId,
    environmentLabel: environment.label,
    environmentMode: environment.mode,
    environmentKind: environment.kind,
    locator: environment.locator,
  };
}
