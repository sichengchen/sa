import {
  ariaDesktopApp,
  ariaDesktopContextPanels,
  ariaDesktopSpaces,
  createAriaDesktopBootstrap,
  type AriaDesktopBootstrap,
} from "@aria/desktop";
import type { AccessClientTarget } from "@aria/access-client";
import type { ProjectRecord, ThreadRecord } from "@aria/projects";

export * from "@aria/desktop";

export const ariaDesktopHost = {
  id: "aria-desktop",
  packageName: "aria-desktop",
  displayName: "Aria Desktop",
  surface: "desktop",
  shellPackage: "@aria/desktop",
  sharedPackages: ariaDesktopApp.sharedPackages,
  capabilities: ariaDesktopApp.capabilities,
  spaces: ariaDesktopSpaces,
  contextPanels: ariaDesktopContextPanels,
} as const;

export interface AriaDesktopHostBootstrap {
  host: typeof ariaDesktopHost;
  shell: typeof ariaDesktopApp;
  bootstrap: AriaDesktopBootstrap;
}

export function createAriaDesktopHostBootstrap(
  target: AccessClientTarget,
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: Pick<ThreadRecord, "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId">;
  },
): AriaDesktopHostBootstrap {
  return {
    host: ariaDesktopHost,
    shell: ariaDesktopApp,
    bootstrap: createAriaDesktopBootstrap(target, initialThread),
  };
}
