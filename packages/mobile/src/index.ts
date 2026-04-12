import {
  buildAccessClientConfig,
  type AccessClientTarget,
} from "@aria/access-client";
import {
  createProjectThreadListItem,
  type ProjectThreadListItem,
} from "@aria/ui";
import type { ProjectRecord, ThreadRecord } from "@aria/projects";

export const ariaMobileApp = {
  id: "aria-mobile",
  displayName: "Aria Mobile",
  surface: "mobile",
  sharedPackages: [
    "@aria/access-client",
    "@aria/ui",
    "@aria/projects",
    "@aria/protocol",
  ],
  capabilities: ["server-access", "project-threads", "remote-review"],
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

export type AriaMobileTab = (typeof ariaMobileTabs)[number];
export type AriaMobileDetailPresentation = (typeof ariaMobileDetailPresentations)[number];

export interface AriaMobileProjectThreads {
  projectLabel: string;
  threads: ProjectThreadListItem[];
}

export interface AriaMobileBootstrap {
  app: typeof ariaMobileApp;
  access: ReturnType<typeof buildAccessClientConfig>;
  initialThread?: ProjectThreadListItem;
}

export interface AriaMobileShellProjectInput {
  project: Pick<ProjectRecord, "name">;
  threads: Array<Pick<ThreadRecord, "threadId" | "title" | "status">>;
}

export interface AriaMobileShellInitialThread {
  project: Pick<ProjectRecord, "name">;
  thread: Pick<ThreadRecord, "threadId" | "title" | "status">;
}

export interface CreateAriaMobileShellOptions {
  target: AccessClientTarget;
  projects?: AriaMobileShellProjectInput[];
  initialThread?: AriaMobileShellInitialThread;
}

export interface AriaMobileShell {
  app: typeof ariaMobileApp;
  tabs: typeof ariaMobileTabs;
  detailPresentations: typeof ariaMobileDetailPresentations;
  access: ReturnType<typeof buildAccessClientConfig>;
  projectThreads: AriaMobileProjectThreads[];
  initialThread?: ProjectThreadListItem;
}

export function createAriaMobileProjectThreads(
  projects: Array<{
    project: Pick<ProjectRecord, "name">;
    threads: Array<Pick<ThreadRecord, "threadId" | "title" | "status">>;
  }>,
): AriaMobileProjectThreads[] {
  return projects.map(({ project, threads }) => ({
    projectLabel: project.name,
    threads: threads.map((thread) => createProjectThreadListItem(project, thread)),
  }));
}

export function createAriaMobileBootstrap(
  target: AccessClientTarget,
  initialThread?: {
    project: Pick<ProjectRecord, "name">;
    thread: Pick<ThreadRecord, "threadId" | "title" | "status">;
  },
): AriaMobileBootstrap {
  return {
    app: ariaMobileApp,
    access: buildAccessClientConfig(target),
    initialThread: initialThread
      ? createProjectThreadListItem(initialThread.project, initialThread.thread)
      : undefined,
  };
}

export function createAriaMobileShell(
  options: CreateAriaMobileShellOptions,
): AriaMobileShell {
  const bootstrap = createAriaMobileBootstrap(options.target, options.initialThread);

  return {
    app: bootstrap.app,
    tabs: ariaMobileTabs,
    detailPresentations: ariaMobileDetailPresentations,
    access: bootstrap.access,
    projectThreads: createAriaMobileProjectThreads(options.projects ?? []),
    initialThread: bootstrap.initialThread,
  };
}
