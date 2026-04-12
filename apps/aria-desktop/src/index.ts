import {
  buildAccessClientConfig,
  type AccessClientTarget,
} from "@aria/access-client";
import {
  createProjectThreadListItem,
  type ProjectThreadListItem,
} from "@aria/ui";
import type { ProjectRecord, ThreadRecord } from "@aria/projects";

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
} as const;

export interface AriaDesktopBootstrap {
  app: typeof ariaDesktopApp;
  access: ReturnType<typeof buildAccessClientConfig>;
  initialThread?: ProjectThreadListItem;
}

export function createAriaDesktopBootstrap(
  target: AccessClientTarget,
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: Pick<ThreadRecord, "threadId" | "title" | "status">;
  },
): AriaDesktopBootstrap {
  return {
    app: ariaDesktopApp,
    access: buildAccessClientConfig(target),
    initialThread: initialThread
      ? createProjectThreadListItem(initialThread.project, initialThread.thread)
      : undefined,
  };
}
