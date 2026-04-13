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

export interface AriaMobileAriaThreadOptions {
  controller?: AriaChatController;
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
    ariaThreadState?: AriaChatState;
  },
): AriaMobileAppShell {
  const shell = createAriaMobileShell(options);

  return {
    ...shell,
    navigation: ariaMobileNavigation,
    ariaThread: createAriaMobileAriaThread(options.target, {
      controller: options.ariaThreadController,
      state: options.ariaThreadState,
    }),
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
    ariaThreadState?: AriaChatState;
  },
): Promise<AriaMobileAppShell> {
  return connectAriaMobileAppShell(createAriaMobileAppShell(options));
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
    id: "relay-attached",
    label: "Relay-attached",
    description:
      "Stay connected through Aria Relay for approvals, remote review, and reconnect-safe thread handoff.",
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
      "Aria Mobile stays remote-first: approvals, automation, reconnect, and project-thread review over server access.",
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
