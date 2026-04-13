import { buildAccessClientConfig, type AccessClientTarget } from "@aria/access-client";
import { createProjectThreadListItem, type ProjectThreadListItem } from "@aria/ui";
import {
  describeThreadType,
  resolveThreadType,
  type ProjectRecord,
  type ThreadRecord,
  type ThreadType,
} from "@aria/projects";

export const ariaMobileApp = {
  id: "aria-mobile",
  displayName: "Aria Mobile",
  surface: "mobile",
  sharedPackages: ["@aria/access-client", "@aria/ui", "@aria/projects", "@aria/protocol"],
  capabilities: [
    "server-access",
    "project-threads",
    "remote-review",
    "approvals",
    "automation",
    "reconnect",
  ],
  ownership: {
    ariaAgent: "server-only",
    assistantState: "server-only",
    memory: "server-only",
    automation: "server-only",
    localExecution: "unsupported",
    codingAgents: "server-or-desktop-only",
  },
  serverSwitcher: {
    label: "Server",
    placement: "header",
    mode: "multi-server",
  },
} as const;

export const ariaMobileTabs = [
  { id: "aria", label: "Aria" },
  { id: "projects", label: "Projects" },
] as const;

export const ariaMobileDetailPresentations = [
  "bottom-sheet",
  "push-screen",
  "segmented-detail-view",
] as const;

export const ariaMobileActionSections = [
  { id: "approvals", label: "Approvals" },
  { id: "automation", label: "Automations" },
  { id: "remote-review", label: "Remote Review" },
  { id: "reconnect", label: "Reconnect" },
  { id: "job-status", label: "Job Status" },
] as const;

export type AriaMobileTab = (typeof ariaMobileTabs)[number];
export type AriaMobileDetailPresentation = (typeof ariaMobileDetailPresentations)[number];
export type AriaMobileActionSection = (typeof ariaMobileActionSections)[number];

export interface AriaMobileProjectThreads {
  projectLabel: string;
  threads: AriaMobileProjectThreadItem[];
}

export interface AriaMobileServerInput {
  label?: string;
  target: AccessClientTarget;
}

export interface AriaMobileServerOption {
  id: string;
  label: string;
  access: ReturnType<typeof buildAccessClientConfig>;
}

export interface AriaMobileServerSwitcher {
  label: string;
  placement: "header";
  mode: "multi-server";
  activeServerId: string;
  activeServerLabel: string;
  activeServerAccess: ReturnType<typeof buildAccessClientConfig>;
  availableServers: AriaMobileServerOption[];
}

export interface AriaMobileBootstrap {
  app: typeof ariaMobileApp;
  access: ReturnType<typeof buildAccessClientConfig>;
  servers: AriaMobileServerOption[];
  activeServerId: string;
  activeServerLabel: string;
  serverSwitcher: AriaMobileServerSwitcher;
  initialThread?: AriaMobileProjectThreadItem;
}

export interface AriaMobileThreadSignals {
  approvalLabel?: string;
  automationLabel?: string;
  remoteReviewLabel?: string;
  connectionLabel?: string;
  reconnectLabel?: string;
}

export interface AriaMobileProjectThreadItem
  extends ProjectThreadListItem, AriaMobileThreadSignals {}

export interface AriaMobileThreadContext {
  threadId: string;
  threadType: ThreadType;
  threadTypeLabel: string;
  serverLabel?: string;
  remoteStatusLabel?: string;
  connectionLabel?: string;
  approvalLabel?: string;
  automationLabel?: string;
  remoteReviewLabel?: string;
  reconnectLabel?: string;
  sections: typeof ariaMobileActionSections;
}

export interface AriaMobileShellProjectInput {
  project: Pick<ProjectRecord, "name">;
  threads: AriaMobileProjectThreadInput[];
}

export interface AriaMobileShellInitialThread {
  project: Pick<ProjectRecord, "name">;
  thread: AriaMobileProjectThreadInput;
}

export interface AriaMobileProjectThreadInput
  extends
    Pick<
      ThreadRecord,
      "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId"
    >,
    AriaMobileThreadSignals {}

export interface CreateAriaMobileShellOptions {
  target: AccessClientTarget;
  servers?: AriaMobileServerInput[];
  activeServerId?: string;
  projects?: AriaMobileShellProjectInput[];
  initialThread?: AriaMobileShellInitialThread;
  activeThreadContext?: {
    thread: Pick<ThreadRecord, "threadId" | "threadType"> & AriaMobileThreadSignals;
    serverLabel?: string;
    remoteStatusLabel?: string;
  };
}

export interface AriaMobileShell {
  app: typeof ariaMobileApp;
  tabs: typeof ariaMobileTabs;
  detailPresentations: typeof ariaMobileDetailPresentations;
  actionSections: typeof ariaMobileActionSections;
  access: ReturnType<typeof buildAccessClientConfig>;
  servers: AriaMobileServerOption[];
  activeServerId: string;
  activeServerLabel: string;
  serverSwitcher: AriaMobileServerSwitcher;
  projectThreads: AriaMobileProjectThreads[];
  initialThread?: AriaMobileProjectThreadItem;
  activeThreadContext?: AriaMobileThreadContext;
}

export function createAriaMobileServerOption(
  input: AriaMobileServerInput | AccessClientTarget,
): AriaMobileServerOption {
  const target = "target" in input ? input.target : input;
  return {
    id: target.serverId,
    label: "label" in input && input.label ? input.label : target.serverId,
    access: buildAccessClientConfig(target),
  };
}

export function createAriaMobileServerSwitcher(options: {
  servers: Array<AriaMobileServerInput | AccessClientTarget>;
  activeServerId?: string;
  access: ReturnType<typeof buildAccessClientConfig>;
}): AriaMobileServerSwitcher {
  const availableServers = options.servers.map((server) => createAriaMobileServerOption(server));
  const activeServer =
    availableServers.find(
      (server) => server.id === (options.activeServerId ?? options.access.serverId),
    ) ??
    availableServers[0] ??
    createAriaMobileServerOption({
      serverId: options.access.serverId,
      baseUrl: options.access.httpUrl,
      token: options.access.token,
    });

  return {
    ...ariaMobileApp.serverSwitcher,
    activeServerId: activeServer.id,
    activeServerLabel: activeServer.label,
    activeServerAccess: activeServer.access,
    availableServers,
  };
}

export function createAriaMobileProjectThreadItem(
  project: Pick<ProjectRecord, "name">,
  thread: AriaMobileProjectThreadInput,
): AriaMobileProjectThreadItem {
  const threadItem = createProjectThreadListItem(project, thread);
  return {
    ...threadItem,
    ...(thread.approvalLabel ? { approvalLabel: thread.approvalLabel } : {}),
    ...(thread.automationLabel ? { automationLabel: thread.automationLabel } : {}),
    ...(thread.remoteReviewLabel ? { remoteReviewLabel: thread.remoteReviewLabel } : {}),
    ...(thread.connectionLabel ? { connectionLabel: thread.connectionLabel } : {}),
    ...(thread.reconnectLabel ? { reconnectLabel: thread.reconnectLabel } : {}),
  };
}

export function createAriaMobileProjectThreads(
  projects: Array<{
    project: Pick<ProjectRecord, "name">;
    threads: AriaMobileProjectThreadInput[];
  }>,
): AriaMobileProjectThreads[] {
  return projects.map(({ project, threads }) => ({
    projectLabel: project.name,
    threads: threads.map((thread) => createAriaMobileProjectThreadItem(project, thread)),
  }));
}

export function createAriaMobileThreadContext(input: {
  thread: Pick<ThreadRecord, "threadId" | "threadType"> & AriaMobileThreadSignals;
  serverLabel?: string;
  remoteStatusLabel?: string;
}): AriaMobileThreadContext {
  const threadType = resolveThreadType(input.thread);
  return {
    threadId: input.thread.threadId,
    threadType,
    threadTypeLabel: describeThreadType(threadType),
    serverLabel: input.serverLabel,
    remoteStatusLabel: input.remoteStatusLabel,
    ...(input.thread.connectionLabel ? { connectionLabel: input.thread.connectionLabel } : {}),
    ...(input.thread.approvalLabel ? { approvalLabel: input.thread.approvalLabel } : {}),
    ...(input.thread.automationLabel ? { automationLabel: input.thread.automationLabel } : {}),
    ...(input.thread.remoteReviewLabel
      ? { remoteReviewLabel: input.thread.remoteReviewLabel }
      : {}),
    ...(input.thread.reconnectLabel ? { reconnectLabel: input.thread.reconnectLabel } : {}),
    sections: ariaMobileActionSections,
  };
}

export function createAriaMobileBootstrap(
  target: AccessClientTarget,
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: AriaMobileProjectThreadInput;
  },
  servers: Array<AriaMobileServerInput | AccessClientTarget> = [target],
  activeServerId = target.serverId,
): AriaMobileBootstrap {
  const access = buildAccessClientConfig(target);
  const serverSwitcher = createAriaMobileServerSwitcher({
    access,
    servers,
    activeServerId,
  });
  return {
    app: ariaMobileApp,
    access,
    servers: serverSwitcher.availableServers,
    activeServerId: serverSwitcher.activeServerId,
    activeServerLabel: serverSwitcher.activeServerLabel,
    serverSwitcher,
    initialThread: initialThread
      ? createAriaMobileProjectThreadItem(initialThread.project, initialThread.thread)
      : undefined,
  };
}

export function createAriaMobileShell(options: CreateAriaMobileShellOptions): AriaMobileShell {
  const bootstrap = createAriaMobileBootstrap(
    options.target,
    options.initialThread,
    options.servers ?? [options.target],
    options.activeServerId,
  );

  return {
    app: bootstrap.app,
    tabs: ariaMobileTabs,
    detailPresentations: ariaMobileDetailPresentations,
    actionSections: ariaMobileActionSections,
    access: bootstrap.access,
    servers: bootstrap.servers,
    activeServerId: bootstrap.activeServerId,
    activeServerLabel: bootstrap.activeServerLabel,
    serverSwitcher: bootstrap.serverSwitcher,
    projectThreads: createAriaMobileProjectThreads(options.projects ?? []),
    initialThread: bootstrap.initialThread,
    activeThreadContext: options.activeThreadContext
      ? createAriaMobileThreadContext({
          ...options.activeThreadContext,
          serverLabel: options.activeThreadContext.serverLabel ?? bootstrap.activeServerLabel,
        })
      : options.initialThread
        ? createAriaMobileThreadContext({
            serverLabel: bootstrap.activeServerLabel,
            thread: {
              threadId: options.initialThread.thread.threadId,
              threadType: options.initialThread.thread.threadType,
              approvalLabel: options.initialThread.thread.approvalLabel,
              automationLabel: options.initialThread.thread.automationLabel,
              remoteReviewLabel: options.initialThread.thread.remoteReviewLabel,
              connectionLabel: options.initialThread.thread.connectionLabel,
              reconnectLabel: options.initialThread.thread.reconnectLabel,
            },
            remoteStatusLabel: options.initialThread.thread.connectionLabel,
          })
        : undefined,
  };
}
