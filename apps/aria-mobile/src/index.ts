import {
  ariaMobileApp,
  ariaMobileActionSections,
  ariaMobileDetailPresentations,
  ariaMobileTabs,
  createAriaMobileBootstrap,
  type AriaMobileBootstrap,
} from "@aria/mobile";
import type { AccessClientTarget } from "@aria/access-client";
import type { ProjectRecord, ThreadRecord } from "@aria/projects";

export * from "@aria/mobile";

export const ariaMobileHost = {
  id: "aria-mobile",
  packageName: "aria-mobile",
  displayName: "Aria Mobile",
  surface: "mobile",
  shellPackage: "@aria/mobile",
  sharedPackages: ariaMobileApp.sharedPackages,
  capabilities: ariaMobileApp.capabilities,
  tabs: ariaMobileTabs,
  detailPresentations: ariaMobileDetailPresentations,
  actionSections: ariaMobileActionSections,
} as const;

export interface AriaMobileHostBootstrap {
  host: typeof ariaMobileHost;
  shell: typeof ariaMobileApp;
  bootstrap: AriaMobileBootstrap;
}

export function createAriaMobileHostBootstrap(
  target: AccessClientTarget,
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: Pick<ThreadRecord, "threadId" | "title" | "status" | "threadType" | "environmentId" | "agentId">;
  },
): AriaMobileHostBootstrap {
  return {
    host: ariaMobileHost,
    shell: ariaMobileApp,
    bootstrap: createAriaMobileBootstrap(target, initialThread),
  };
}
