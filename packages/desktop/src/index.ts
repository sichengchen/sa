import { buildAccessClientConfig, type AccessClientTarget } from "@aria/access-client";
import {
  createProjectThreadListItem,
  createStatusBadgeLabel,
  type ProjectThreadListItem,
} from "@aria/ui";
import {
  describeThreadType,
  resolveThreadType,
  type ProjectRecord,
  type ThreadRecord,
  type ThreadType,
} from "@aria/projects";

export const ariaDesktopApp = {
  id: "aria-desktop",
  displayName: "Aria Desktop",
  surface: "desktop",
  sharedPackages: [
    "@aria/access-client",
    "@aria/desktop-bridge",
    "@aria/ui",
    "@aria/projects",
    "@aria/agents-coding",
    "@aria/protocol",
  ],
  capabilities: ["server-access", "project-threads", "local-bridge"],
  executionPlanes: {
    aria: "server",
    remoteProjects: "server",
    localProjects: "desktop",
  },
  serverSwitcher: {
    label: "Server",
    placement: "top-chrome",
    mode: "multi-server",
  },
} as const;

export const ariaDesktopSpaces = [
  { id: "aria", label: "Aria" },
  { id: "projects", label: "Projects" },
] as const;

export const ariaDesktopNavigation = [
  {
    spaceId: "aria",
    label: "Aria",
    defaultScreenId: "chat",
    screens: [
      { id: "chat", label: "Chat" },
      { id: "inbox", label: "Inbox" },
      { id: "automations", label: "Automations" },
      { id: "connectors", label: "Connectors" },
    ],
  },
  {
    spaceId: "projects",
    label: "Projects",
    defaultScreenId: "thread-list",
    screens: [
      { id: "thread-list", label: "Thread List" },
      { id: "thread", label: "Active Thread" },
    ],
  },
] as const;

export const ariaDesktopContextPanels = [
  { id: "review", label: "Review" },
  { id: "changes", label: "Changes" },
  { id: "environment", label: "Environment" },
  { id: "job", label: "Job State" },
  { id: "approvals", label: "Approvals" },
  { id: "artifacts", label: "Artifacts" },
] as const;

export type AriaDesktopSpace = (typeof ariaDesktopSpaces)[number];
export type AriaDesktopContextPanel = (typeof ariaDesktopContextPanels)[number];
export type AriaDesktopNavigation = (typeof ariaDesktopNavigation)[number];

export interface AriaDesktopProjectSidebar {
  label: string;
  mode: "unified-project-thread-tree";
  projects: AriaDesktopSidebarProject[];
}

export interface AriaDesktopThreadListScreen {
  title: string;
  description: string;
  mode: "unified-project-thread-list";
  projectSidebar: AriaDesktopProjectSidebar;
}

export interface AriaDesktopThreadHeader {
  threadId: string;
  title: string;
  serverLabel?: string;
  projectLabel?: string;
  threadType: ThreadType;
  threadTypeLabel: string;
  statusLabel: string;
  environmentId?: string;
  environmentLabel?: string;
  agentLabel?: string;
}

export interface AriaDesktopEnvironmentSwitcher {
  label: string;
  placement: "thread-header";
  activeEnvironmentId?: string;
  availableEnvironments: AriaDesktopEnvironmentOption[];
}

export interface AriaDesktopThreadStream {
  placement: "center-column";
  tracks: ["messages", "runs"];
  live: true;
}

export interface AriaDesktopComposer {
  placement: "bottom-docked";
  scope: "active-thread";
  threadId: string;
}

export interface AriaDesktopThreadScreen {
  header: AriaDesktopThreadHeader;
  environmentSwitcher: AriaDesktopEnvironmentSwitcher;
  stream: AriaDesktopThreadStream;
  composer: AriaDesktopComposer;
  contextPanels: typeof ariaDesktopContextPanels;
  defaultContextPanelId: (typeof ariaDesktopContextPanels)[number]["id"];
}

export interface AriaDesktopSidebarProject {
  projectLabel: string;
  threads: ProjectThreadListItem[];
}

export interface AriaDesktopEnvironmentOption {
  id: string;
  label: string;
  mode: "local" | "remote";
  access: ReturnType<typeof buildAccessClientConfig>;
}

export type AriaDesktopEnvironmentInput =
  | AriaDesktopEnvironmentOption
  | {
      environmentId: string;
      hostLabel: string;
      environmentLabel: string;
      mode: "local" | "remote";
      target: AccessClientTarget;
    };

export interface AriaDesktopBootstrap {
  app: typeof ariaDesktopApp;
  access: ReturnType<typeof buildAccessClientConfig>;
  servers: AriaDesktopServerOption[];
  activeServerId: string;
  activeServerLabel: string;
  serverSwitcher: AriaDesktopServerSwitcher;
  initialThread?: ProjectThreadListItem;
}

export interface AriaDesktopThreadContext {
  threadId: string;
  threadType: ThreadType;
  threadTypeLabel: string;
  serverLabel?: string;
  projectLabel?: string;
  threadTitle?: string;
  threadStatusLabel?: string;
  environmentId?: string;
  environmentLabel?: string;
  agentLabel?: string;
  panels: typeof ariaDesktopContextPanels;
}

export interface AriaDesktopShellProjectInput {
  project: Pick<ProjectRecord, "name">;
  threads: Array<
    Pick<ThreadRecord, "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId">
  >;
}

export interface AriaDesktopServerInput {
  label?: string;
  target: AccessClientTarget;
}

export interface AriaDesktopServerOption {
  id: string;
  label: string;
  access: ReturnType<typeof buildAccessClientConfig>;
}

export interface AriaDesktopServerSwitcher {
  label: string;
  placement: "top-chrome";
  mode: "multi-server";
  activeServerId: string;
  activeServerLabel: string;
  activeServerAccess: ReturnType<typeof buildAccessClientConfig>;
  availableServers: AriaDesktopServerOption[];
}

export interface AriaDesktopShellInitialThread {
  project: Pick<ProjectRecord, "name">;
  thread: Pick<
    ThreadRecord,
    "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId"
  >;
}

export interface CreateAriaDesktopShellOptions {
  target: AccessClientTarget;
  servers?: AriaDesktopServerInput[];
  activeServerId?: string;
  projects?: AriaDesktopShellProjectInput[];
  environments?: AriaDesktopEnvironmentInput[];
  initialThread?: AriaDesktopShellInitialThread;
  activeThreadContext?: {
    serverLabel?: string;
    projectLabel?: string;
    thread: Pick<
      ThreadRecord,
      "threadId" | "threadType" | "title" | "status" | "environmentId" | "agentId"
    >;
    environmentLabel?: string;
    agentLabel?: string;
  };
}

export interface AriaDesktopShell {
  app: typeof ariaDesktopApp;
  navigation: typeof ariaDesktopNavigation;
  spaces: typeof ariaDesktopSpaces;
  contextPanels: typeof ariaDesktopContextPanels;
  composerPlacement: "bottom-docked";
  access: ReturnType<typeof buildAccessClientConfig>;
  servers: AriaDesktopServerOption[];
  activeServerId: string;
  activeServerLabel: string;
  serverSwitcher: AriaDesktopServerSwitcher;
  projectSidebar: AriaDesktopProjectSidebar;
  projectThreadListScreen: AriaDesktopThreadListScreen;
  environments: AriaDesktopEnvironmentOption[];
  sidebarProjects: AriaDesktopSidebarProject[];
  initialThread?: ProjectThreadListItem;
  activeThreadContext?: AriaDesktopThreadContext;
  activeThreadScreen?: AriaDesktopThreadScreen;
}

export function createAriaDesktopSidebarProjects(
  projects: Array<{
    project: Pick<ProjectRecord, "name">;
    threads: Array<
      Pick<
        ThreadRecord,
        "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId"
      >
    >;
  }>,
): AriaDesktopSidebarProject[] {
  return projects.map(({ project, threads }) => ({
    projectLabel: project.name,
    threads: threads.map((thread) => createProjectThreadListItem(project, thread)),
  }));
}

export function createAriaDesktopServerOption(
  input: AriaDesktopServerInput | AccessClientTarget,
): AriaDesktopServerOption {
  const target = "target" in input ? input.target : input;
  return {
    id: target.serverId,
    label: "label" in input && input.label ? input.label : target.serverId,
    access: buildAccessClientConfig(target),
  };
}

export function createAriaDesktopServerSwitcher(options: {
  servers: Array<AriaDesktopServerInput | AccessClientTarget>;
  activeServerId?: string;
  access: ReturnType<typeof buildAccessClientConfig>;
}): AriaDesktopServerSwitcher {
  const availableServers = options.servers.map((server) => createAriaDesktopServerOption(server));
  const activeServer =
    availableServers.find(
      (server) => server.id === (options.activeServerId ?? options.access.serverId),
    ) ??
    availableServers[0] ??
    createAriaDesktopServerOption({
      serverId: options.access.serverId,
      baseUrl: options.access.httpUrl,
      token: options.access.token,
    });

  return {
    ...ariaDesktopApp.serverSwitcher,
    activeServerId: activeServer.id,
    activeServerLabel: activeServer.label,
    activeServerAccess: activeServer.access,
    availableServers,
  };
}

export function createAriaDesktopThreadContext(input: {
  serverLabel?: string;
  projectLabel?: string;
  thread: Pick<
    ThreadRecord,
    "threadId" | "threadType" | "title" | "status" | "environmentId" | "agentId"
  >;
  environmentLabel?: string;
  agentLabel?: string;
}): AriaDesktopThreadContext {
  const threadType = resolveThreadType(input.thread);
  return {
    threadId: input.thread.threadId,
    threadType,
    threadTypeLabel: describeThreadType(threadType),
    serverLabel: input.serverLabel,
    projectLabel: input.projectLabel,
    threadTitle: input.thread.title,
    threadStatusLabel: createStatusBadgeLabel(input.thread.status),
    environmentId: input.thread.environmentId ?? undefined,
    environmentLabel: input.environmentLabel,
    agentLabel: input.agentLabel,
    panels: ariaDesktopContextPanels,
  };
}

export function createAriaDesktopEnvironmentOption(input: {
  environmentId: string;
  hostLabel: string;
  environmentLabel: string;
  mode: "local" | "remote";
  target: AccessClientTarget;
}): AriaDesktopEnvironmentOption {
  return {
    id: input.environmentId,
    label: `${input.hostLabel} / ${input.environmentLabel}`,
    mode: input.mode,
    access: buildAccessClientConfig(input.target),
  };
}

export function createAriaDesktopThreadScreen(input: {
  serverLabel?: string;
  projectLabel?: string;
  thread: Pick<
    ThreadRecord,
    "threadId" | "threadType" | "title" | "status" | "environmentId" | "agentId"
  >;
  environmentLabel?: string;
  agentLabel?: string;
  environments?: AriaDesktopEnvironmentInput[];
}): AriaDesktopThreadScreen {
  const threadType = resolveThreadType(input.thread);
  const availableEnvironments = (input.environments ?? []).map((environment) =>
    "access" in environment ? environment : createAriaDesktopEnvironmentOption(environment),
  );

  return {
    header: {
      threadId: input.thread.threadId,
      title: input.thread.title,
      serverLabel: input.serverLabel,
      projectLabel: input.projectLabel,
      threadType,
      threadTypeLabel: describeThreadType(threadType),
      statusLabel: createStatusBadgeLabel(input.thread.status),
      environmentId: input.thread.environmentId ?? undefined,
      environmentLabel: input.environmentLabel,
      agentLabel: input.agentLabel,
    },
    environmentSwitcher: {
      label: "Environment",
      placement: "thread-header",
      activeEnvironmentId: input.thread.environmentId ?? undefined,
      availableEnvironments,
    },
    stream: {
      placement: "center-column",
      tracks: ["messages", "runs"],
      live: true,
    },
    composer: {
      placement: "bottom-docked",
      scope: "active-thread",
      threadId: input.thread.threadId,
    },
    contextPanels: ariaDesktopContextPanels,
    defaultContextPanelId: "review",
  };
}

export function createAriaDesktopBootstrap(
  target: AccessClientTarget,
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: Pick<
      ThreadRecord,
      "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId"
    >;
  },
  servers: Array<AriaDesktopServerInput | AccessClientTarget> = [target],
  activeServerId = target.serverId,
): AriaDesktopBootstrap {
  const access = buildAccessClientConfig(target);
  const serverSwitcher = createAriaDesktopServerSwitcher({
    access,
    servers,
    activeServerId,
  });
  return {
    app: ariaDesktopApp,
    access,
    servers: serverSwitcher.availableServers,
    activeServerId: serverSwitcher.activeServerId,
    activeServerLabel: serverSwitcher.activeServerLabel,
    serverSwitcher,
    initialThread: initialThread
      ? createProjectThreadListItem(initialThread.project, initialThread.thread)
      : undefined,
  };
}

export function createAriaDesktopShell(options: CreateAriaDesktopShellOptions): AriaDesktopShell {
  const bootstrap = createAriaDesktopBootstrap(
    options.target,
    options.initialThread,
    options.servers ?? [options.target],
    options.activeServerId,
  );
  const projectSidebar: AriaDesktopProjectSidebar = {
    label: "Projects",
    mode: "unified-project-thread-tree",
    projects: createAriaDesktopSidebarProjects(options.projects ?? []),
  };
  const projectThreadListScreen: AriaDesktopThreadListScreen = {
    title: "Unified project threads",
    description:
      "Project threads stay grouped by project while environment switching happens in the active thread view.",
    mode: "unified-project-thread-list",
    projectSidebar,
  };
  const activeThreadSource = options.activeThreadContext
    ? {
        ...options.activeThreadContext,
        serverLabel: options.activeThreadContext.serverLabel ?? bootstrap.activeServerLabel,
      }
    : options.initialThread
      ? {
          serverLabel: bootstrap.activeServerLabel,
          projectLabel: options.initialThread.project.name,
          thread: {
            ...options.initialThread.thread,
          },
        }
      : undefined;

  return {
    app: bootstrap.app,
    navigation: ariaDesktopNavigation,
    spaces: ariaDesktopSpaces,
    contextPanels: ariaDesktopContextPanels,
    composerPlacement: "bottom-docked",
    access: bootstrap.access,
    servers: bootstrap.servers,
    activeServerId: bootstrap.activeServerId,
    activeServerLabel: bootstrap.activeServerLabel,
    serverSwitcher: bootstrap.serverSwitcher,
    projectSidebar,
    projectThreadListScreen,
    environments: (options.environments ?? []).map((environment) =>
      "access" in environment ? environment : createAriaDesktopEnvironmentOption(environment),
    ),
    sidebarProjects: createAriaDesktopSidebarProjects(options.projects ?? []),
    initialThread: bootstrap.initialThread,
    activeThreadContext: activeThreadSource
      ? createAriaDesktopThreadContext(activeThreadSource)
      : undefined,
    activeThreadScreen:
      activeThreadSource && activeThreadSource.thread
        ? createAriaDesktopThreadScreen({
            serverLabel: bootstrap.activeServerLabel,
            projectLabel: activeThreadSource.projectLabel,
            thread: activeThreadSource.thread,
            environmentLabel: activeThreadSource.environmentLabel,
            agentLabel: activeThreadSource.agentLabel,
            environments: options.environments,
          })
        : undefined,
  };
}
