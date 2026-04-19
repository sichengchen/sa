import type {
  EnvironmentRecord,
  ProjectRecord,
  ServerRecord,
  TaskStatus,
  ThreadRecord,
  ThreadStatus,
  ThreadType,
  WorkspaceRecord,
} from "./types.js";
import { describeThreadType, resolveThreadType } from "./types.js";

export interface ProjectThreadListItem {
  id: string;
  title: string;
  projectLabel: string;
  status: string;
  threadType: ThreadType;
  threadTypeLabel: string;
  environmentId?: string | null;
  agentId?: string | null;
}

export interface ProjectEnvironmentListItem {
  id: string;
  label: string;
  hostLabel: string;
  mode: EnvironmentRecord["mode"];
  kind: EnvironmentRecord["kind"];
  locator: string;
}

export interface ProjectServerSummary {
  serverId: string;
  label: string;
  httpUrl: string;
  wsUrl: string;
  isSelected: boolean;
  selectionLabel: string;
}

export interface ProjectServerListItem {
  id: string;
  label: string;
  connectionLabel: string;
  selectionLabel: string;
  isSelected: boolean;
}

export interface ProjectServerRoster {
  selectedServerId: string | null;
  items: ProjectServerListItem[];
  selectedItem: ProjectServerListItem | null;
}

function formatStatusLabel(status: TaskStatus | ThreadStatus): string {
  return status
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function createProjectThreadListItem(
  project: Pick<ProjectRecord, "name">,
  thread: Pick<
    ThreadRecord,
    "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId"
  >,
): ProjectThreadListItem {
  const threadType = resolveThreadType(thread);
  return {
    id: thread.threadId,
    title: thread.title,
    projectLabel: project.name,
    status: formatStatusLabel(thread.status),
    threadType,
    threadTypeLabel: describeThreadType(threadType),
    environmentId: thread.environmentId ?? null,
    agentId: thread.agentId ?? null,
  };
}

export function createStatusBadgeLabel(status: TaskStatus | ThreadStatus): string {
  return formatStatusLabel(status);
}

export function createProjectEnvironmentListItem(
  workspace: Pick<WorkspaceRecord, "workspaceId" | "label">,
  environment: Pick<EnvironmentRecord, "environmentId" | "label" | "mode" | "kind" | "locator">,
  server?: Pick<ServerRecord, "label"> | null,
): ProjectEnvironmentListItem {
  return {
    id: environment.environmentId,
    label: environment.label,
    hostLabel: server?.label ?? workspace.label,
    mode: environment.mode,
    kind: environment.kind,
    locator: environment.locator,
  };
}

export function createProjectServerListItem(server: ProjectServerSummary): ProjectServerListItem {
  return {
    id: server.serverId,
    label: server.label,
    connectionLabel: server.httpUrl,
    selectionLabel: server.selectionLabel,
    isSelected: server.isSelected,
  };
}

export function createProjectServerRoster(
  servers: ReadonlyArray<ProjectServerSummary>,
): ProjectServerRoster {
  const items = servers.map((server) => createProjectServerListItem(server));

  return {
    selectedServerId: servers.find((server) => server.isSelected)?.serverId ?? null,
    items,
    selectedItem: items.find((item) => item.isSelected) ?? null,
  };
}
