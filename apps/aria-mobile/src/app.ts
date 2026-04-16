import {
  ariaMobileActionSections,
  ariaMobileApp,
  ariaMobileDetailPresentations,
  ariaMobileTabs,
  createAriaMobileShell,
  type AriaMobileShell,
  type CreateAriaMobileShellOptions,
  type AriaMobileBootstrap,
  type AriaMobileServerInput,
  type AriaMobileShellInitialThread,
} from "@aria/mobile";
import {
  createTargetAriaChatController,
  type AccessClientTarget,
  type AriaChatController,
  type AriaChatSessionSummary,
  type AriaChatState,
} from "@aria/access-client";

export interface AriaMobileNavigationSpaceScreen {
  id: string;
  label: string;
  kind: "feed" | "list" | "thread" | "sheet";
}

export interface AriaMobileNavigationSpace {
  id: (typeof ariaMobileTabs)[number]["id"];
  label: (typeof ariaMobileTabs)[number]["label"];
  defaultScreenId: string;
  screens: readonly AriaMobileNavigationSpaceScreen[];
}

export interface AriaMobileNavigation {
  tabs: typeof ariaMobileTabs;
  spaces: readonly AriaMobileNavigationSpace[];
  detailPresentations: typeof ariaMobileDetailPresentations;
  actionSections: typeof ariaMobileActionSections;
}

export const ariaMobileNavigation = {
  tabs: ariaMobileTabs,
  spaces: [
    {
      id: "aria",
      label: "Aria",
      defaultScreenId: "chat",
      screens: [
        { id: "chat", label: "Chat", kind: "thread" },
        { id: "inbox", label: "Inbox", kind: "feed" },
        { id: "automations", label: "Automations", kind: "feed" },
        { id: "connectors", label: "Connectors", kind: "feed" },
      ],
    },
    {
      id: "projects",
      label: "Projects",
      defaultScreenId: "thread-list",
      screens: [
        { id: "thread-list", label: "Thread List", kind: "list" },
        { id: "thread", label: "Active Thread", kind: "thread" },
      ],
    },
  ],
  detailPresentations: ariaMobileDetailPresentations,
  actionSections: ariaMobileActionSections,
} as const satisfies AriaMobileNavigation;

export interface AriaMobileAppShell extends AriaMobileShell {
  navigation: typeof ariaMobileNavigation;
  ariaThread: {
    controller: AriaChatController;
    state: AriaChatState;
  };
  ariaRecentSessions: AriaChatSessionSummary[];
  sourceOptions: AriaMobileAppShellSourceOptions;
  layout: {
    threadListScreen: {
      placement: "stacked";
      mode: "project-first";
    };
    activeThreadScreen: {
      headerPlacement: "top";
      streamPlacement: "center";
      composerPlacement: "bottom";
      detailPresentations: typeof ariaMobileDetailPresentations;
    };
  };
}

export interface AriaMobileAppShellSourceOptions extends Omit<
  CreateAriaMobileShellOptions & {
    ariaThreadController?: AriaChatController;
    createAriaThreadController?: (target: AccessClientTarget) => AriaChatController;
    ariaThreadState?: AriaChatState;
  },
  "ariaThreadController" | "ariaThreadState"
> {}

export interface AriaMobileAriaThreadOptions {
  controller?: AriaChatController;
  controllerFactory?: (target: AccessClientTarget) => AriaChatController;
  state?: AriaChatState;
  connectorType?: string;
  prefix?: string;
}

export function createAriaMobileAriaThread(
  target: AccessClientTarget,
  options: AriaMobileAriaThreadOptions = {},
) {
  const controller =
    options.controller ??
    options.controllerFactory?.(target) ??
    createTargetAriaChatController(target, {
      connectorType: options.connectorType ?? "tui",
      prefix: options.prefix ?? "mobile",
    });

  return {
    controller,
    state: options.state ?? controller.getState(),
  };
}

export function createAriaMobileAppShell(
  options: CreateAriaMobileShellOptions & {
    ariaThreadController?: AriaChatController;
    createAriaThreadController?: (target: AccessClientTarget) => AriaChatController;
    ariaThreadState?: AriaChatState;
  },
): AriaMobileAppShell {
  const shell = createAriaMobileShell(options);

  return {
    ...shell,
    navigation: ariaMobileNavigation,
    ariaThread: createAriaMobileAriaThread(options.target, {
      controller: options.ariaThreadController,
      controllerFactory: options.createAriaThreadController,
      state: options.ariaThreadState,
    }),
    ariaRecentSessions: [],
    sourceOptions: {
      target: options.target,
      servers: options.servers,
      activeServerId: options.activeServerId,
      projects: options.projects,
      initialThread: options.initialThread,
      activeThreadContext: options.activeThreadContext,
      createAriaThreadController: options.createAriaThreadController,
    },
    layout: {
      threadListScreen: {
        placement: "stacked",
        mode: "project-first",
      },
      activeThreadScreen: {
        headerPlacement: "top",
        streamPlacement: "center",
        composerPlacement: "bottom",
        detailPresentations: ariaMobileDetailPresentations,
      },
    },
  };
}

export async function connectAriaMobileAppShell(
  shell: AriaMobileAppShell,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.connect();

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function createConnectedAriaMobileAppShell(
  options: CreateAriaMobileShellOptions & {
    ariaThreadController?: AriaChatController;
    createAriaThreadController?: (target: AccessClientTarget) => AriaChatController;
    ariaThreadState?: AriaChatState;
  },
): Promise<AriaMobileAppShell> {
  return connectAriaMobileAppShell(createAriaMobileAppShell(options));
}

export async function startAriaMobileNativeHostShell(
  options: CreateAriaMobileShellOptions & {
    ariaThreadController?: AriaChatController;
    createAriaThreadController?: (target: AccessClientTarget) => AriaChatController;
    ariaThreadState?: AriaChatState;
  },
): Promise<AriaMobileAppShell> {
  const connected = await createConnectedAriaMobileAppShell(options);
  return loadAriaMobileAppShellRecentSessions(connected);
}

export async function sendAriaMobileAppShellMessage(
  shell: AriaMobileAppShell,
  message: string,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.sendMessage(message);

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function stopAriaMobileAppShell(
  shell: AriaMobileAppShell,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.stop();

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function openAriaMobileAppShellSession(
  shell: AriaMobileAppShell,
  sessionId: string,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.openSession(sessionId);

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function approveAriaMobileAppShellToolCall(
  shell: AriaMobileAppShell,
  toolCallId: string,
  approved: boolean,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.approveToolCall(toolCallId, approved);

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function acceptAriaMobileAppShellToolCallForSession(
  shell: AriaMobileAppShell,
  toolCallId: string,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.acceptToolCallForSession(toolCallId);

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function answerAriaMobileAppShellQuestion(
  shell: AriaMobileAppShell,
  questionId: string,
  answer: string,
): Promise<AriaMobileAppShell> {
  await shell.ariaThread.controller.answerQuestion(questionId, answer);

  return {
    ...shell,
    ariaThread: {
      ...shell.ariaThread,
      state: shell.ariaThread.controller.getState(),
    },
  };
}

export async function loadAriaMobileAppShellRecentSessions(
  shell: AriaMobileAppShell,
): Promise<AriaMobileAppShell> {
  const [live, archived] = await Promise.all([
    shell.ariaThread.controller.listSessions(),
    shell.ariaThread.controller.listArchivedSessions(),
  ]);

  return {
    ...shell,
    ariaRecentSessions: [...live, ...archived],
  };
}

export async function searchAriaMobileAppShellSessions(
  shell: AriaMobileAppShell,
  query: string,
): Promise<AriaMobileAppShell> {
  return {
    ...shell,
    ariaRecentSessions: await shell.ariaThread.controller.searchSessions(query),
  };
}

function resolveMobileServerTarget(
  shell: AriaMobileAppShell,
  serverId: string,
): AccessClientTarget | null {
  const explicitServers = shell.sourceOptions.servers ?? [];
  for (const entry of explicitServers) {
    const target = "target" in entry ? entry.target : entry;
    if (target.serverId === serverId) {
      return target;
    }
  }

  if (shell.sourceOptions.target.serverId === serverId) {
    return shell.sourceOptions.target;
  }

  const fallback = shell.serverSwitcher.availableServers.find((server) => server.id === serverId);
  if (fallback) {
    return {
      serverId: fallback.id,
      baseUrl: fallback.access.httpUrl,
      token: fallback.access.token,
    };
  }

  return null;
}

export async function switchAriaMobileAppShellServer(
  shell: AriaMobileAppShell,
  serverId: string,
): Promise<AriaMobileAppShell> {
  const target = resolveMobileServerTarget(shell, serverId);
  if (!target) {
    return shell;
  }

  const rebuilt = createAriaMobileAppShell({
    ...shell.sourceOptions,
    target,
    activeServerId: serverId,
  });
  const connected = await connectAriaMobileAppShell(rebuilt);
  return loadAriaMobileAppShellRecentSessions(connected);
}

export const ariaMobileAppModel = {
  app: ariaMobileApp,
  navigation: ariaMobileNavigation,
  serverSwitcher: ariaMobileApp.serverSwitcher,
} as const;

export const ariaMobileLaunchModes = [
  {
    id: "server-connected",
    label: "Server-connected",
    description:
      "Open Aria chat, inbox, automations, and project threads against a live Aria Server.",
  },
  {
    id: "published-gateway",
    label: "Published gateway",
    description:
      "Stay connected through a published Aria Server gateway for approvals, notifications, attachment handoff, remote review, and reconnect-safe thread handoff.",
  },
] as const;

export const ariaMobileAppFrame = {
  kind: "stacked-mobile-shell",
  serverSwitcher: {
    placement: "header",
    mode: "multi-server",
  },
  tabs: ariaMobileTabs,
  ariaSpace: {
    defaultScreenId: "chat",
    feedScreens: ["inbox", "automations", "connectors"],
  },
  projectsSpace: {
    defaultScreenId: "thread-list",
    threadListMode: "project-first",
    activeThreadScreenId: "thread",
  },
  detail: {
    presentations: ariaMobileDetailPresentations,
  },
  actionRail: {
    sections: ariaMobileActionSections,
  },
} as const;

export const ariaMobileApplication = {
  id: "aria-mobile",
  packageName: "aria-mobile",
  displayName: "Aria Mobile",
  surface: "mobile",
  shellPackage: "@aria/mobile",
  shell: ariaMobileApp,
  sharedPackages: ariaMobileApp.sharedPackages,
  capabilities: ariaMobileApp.capabilities,
  serverSwitcher: ariaMobileApp.serverSwitcher,
  navigation: ariaMobileNavigation,
  launchModes: ariaMobileLaunchModes,
  frame: ariaMobileAppFrame,
  startup: {
    defaultTabId: "aria",
    defaultScreenId: "chat",
    landingDescription:
      "Aria Mobile stays remote-first: approvals, notifications, attachments, automation, reconnect, and project-thread review over server access.",
  },
} as const;

export interface AriaMobileApplicationBootstrap {
  application: typeof ariaMobileApplication;
  shell: typeof ariaMobileApp;
  bootstrap: AriaMobileBootstrap;
}

interface AriaMobileApplicationBootstrapOptions {
  target: AccessClientTarget;
  initialThread?: AriaMobileShellInitialThread;
  servers?: AriaMobileServerInput[];
  activeServerId?: string;
}

function normalizeMobileApplicationBootstrapOptions(
  targetOrOptions: AccessClientTarget | AriaMobileApplicationBootstrapOptions,
  initialThread?: AriaMobileShellInitialThread,
): AriaMobileApplicationBootstrapOptions {
  if ("target" in targetOrOptions) {
    return targetOrOptions;
  }

  return {
    target: targetOrOptions,
    initialThread,
  };
}

export function createAriaMobileApplicationBootstrap(
  targetOrOptions: AccessClientTarget | AriaMobileApplicationBootstrapOptions,
  initialThread?: AriaMobileShellInitialThread,
): AriaMobileApplicationBootstrap {
  const options = normalizeMobileApplicationBootstrapOptions(targetOrOptions, initialThread);
  const bootstrap = createAriaMobileAppShell(options);

  return {
    application: ariaMobileApplication,
    shell: ariaMobileApp,
    bootstrap,
  };
}
