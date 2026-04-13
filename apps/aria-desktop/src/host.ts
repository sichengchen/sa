import {
  ariaDesktopApp,
  ariaDesktopContextPanels,
  ariaDesktopNavigation,
  ariaDesktopSpaces,
  createAriaDesktopBootstrap,
  type AriaDesktopServerInput,
  type AriaDesktopBootstrap,
} from "@aria/desktop";
import type { AccessClientTarget } from "@aria/access-client";
import type { ProjectRecord, ThreadRecord } from "@aria/projects";

export const ariaDesktopHost = {
  id: "aria-desktop",
  packageName: "aria-desktop",
  displayName: "Aria Desktop",
  surface: "desktop",
  shellPackage: "@aria/desktop",
  sharedPackages: ariaDesktopApp.sharedPackages,
  capabilities: ariaDesktopApp.capabilities,
  serverSwitcher: ariaDesktopApp.serverSwitcher,
  navigation: ariaDesktopNavigation,
  spaces: ariaDesktopSpaces,
  contextPanels: ariaDesktopContextPanels,
} as const;

export interface AriaDesktopHostBootstrap {
  host: typeof ariaDesktopHost;
  shell: typeof ariaDesktopApp;
  bootstrap: AriaDesktopBootstrap;
}

export function createAriaDesktopHostBootstrap(options: {
  target: AccessClientTarget;
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: Pick<
      ThreadRecord,
      "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId"
    >;
  };
  servers?: AriaDesktopServerInput[];
  activeServerId?: string;
}): AriaDesktopHostBootstrap {
  return {
    host: ariaDesktopHost,
    shell: ariaDesktopApp,
    bootstrap: createAriaDesktopBootstrap(
      options.target,
      options.initialThread,
      options.servers,
      options.activeServerId,
    ),
  };
}
