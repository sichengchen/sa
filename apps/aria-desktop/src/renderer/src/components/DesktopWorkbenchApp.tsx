import { ChevronDown, ChevronRight, FolderPlus, MessageSquarePlus, Settings2 } from "lucide-react";
import { startTransition, useState } from "react";
import { DesktopBaseLayout, type DesktopBaseLayoutToolbarItem } from "./DesktopBaseLayout.js";
import { DesktopCollapsibleSection } from "./DesktopCollapsibleSection.js";
import { DesktopIconButton } from "./DesktopIconButton.js";
import { DesktopSidebarButton } from "./DesktopSidebarButton.js";

type ThreadMessage = {
  body: string;
  id: string;
  role: "Agent" | "Operator" | "Tool";
};

type ProjectThread = {
  environment: string;
  id: string;
  messages: ThreadMessage[];
  name: string;
  status: "Draft" | "Running" | "Review";
  updatedLabel: string;
};

type ProjectWorkspace = {
  id: string;
  name: string;
  root: string;
  threads: ProjectThread[];
};

type AppView =
  | {
      kind: "settings";
    }
  | {
      kind: "thread";
      projectId: string;
      threadId: string;
    };

const INITIAL_PROJECTS: ProjectWorkspace[] = [
  {
    id: "project-atlas",
    name: "atlas-app",
    root: "~/Projects/atlas-app",
    threads: [
      {
        environment: "This Device / main",
        id: "thread-atlas-workspace",
        messages: [
          {
            body: "Split the desktop shell so the project tree stays visible while thread context moves in the center pane.",
            id: "atlas-1",
            role: "Operator",
          },
          {
            body: "The active workspace remains local, so the thread keeps one identity while the layout work stays attached to the same project.",
            id: "atlas-2",
            role: "Agent",
          },
          {
            body: "Renderer build is clean. Sidebar state and pane sizes are ready for the next UI pass.",
            id: "atlas-3",
            role: "Tool",
          },
        ],
        name: "Workspace split view",
        status: "Running",
        updatedLabel: "2m",
      },
      {
        environment: "This Device / wt/login-refresh",
        id: "thread-atlas-login",
        messages: [
          {
            body: "Carry the auth-state cleanup in the feature worktree and keep the review thread separate from layout work.",
            id: "atlas-login-1",
            role: "Operator",
          },
          {
            body: "The thread is still pointed at the login worktree, so review artifacts stay isolated from main.",
            id: "atlas-login-2",
            role: "Agent",
          },
        ],
        name: "Login state cleanup",
        status: "Review",
        updatedLabel: "12m",
      },
    ],
  },
  {
    id: "project-mercury",
    name: "mercury-api",
    root: "~/Projects/mercury-api",
    threads: [
      {
        environment: "Home Server / sandbox/release-qa",
        id: "thread-mercury-release",
        messages: [
          {
            body: "Track the release verification separately from local feature work so the remote job can continue while the desktop disconnects.",
            id: "mercury-1",
            role: "Operator",
          },
          {
            body: "Release checks are running remotely. The project thread keeps the same identity while the environment attachment stays explicit.",
            id: "mercury-2",
            role: "Agent",
          },
        ],
        name: "Release checklist",
        status: "Running",
        updatedLabel: "5m",
      },
    ],
  },
  {
    id: "project-sparrow",
    name: "sparrow-site",
    root: "~/Projects/sparrow-site",
    threads: [
      {
        environment: "This Device / main",
        id: "thread-sparrow-hero",
        messages: [
          {
            body: "Tune the first viewport motion and keep the hero changes in a dedicated thread for design review.",
            id: "sparrow-1",
            role: "Operator",
          },
          {
            body: "The motion pass is local. Inspector notes and terminal output stay attached to the same thread.",
            id: "sparrow-2",
            role: "Agent",
          },
        ],
        name: "Hero motion tune",
        status: "Draft",
        updatedLabel: "19m",
      },
    ],
  },
];

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createThread(projectName: string, threadCount: number): ProjectThread {
  const index = threadCount + 1;

  return {
    environment: "This Device / main",
    id: createId("thread"),
    messages: [
      {
        body: `Start a new workspace thread for ${projectName} and keep the execution target explicit from the first run.`,
        id: createId("message"),
        role: "Operator",
      },
      {
        body: "Thread created. The workspace is attached locally and ready for the next dispatch.",
        id: createId("message"),
        role: "Agent",
      },
    ],
    name: threadCount === 0 ? "Workspace kickoff" : `Thread ${index}`,
    status: "Draft",
    updatedLabel: "Just now",
  };
}

function createProject(projectCount: number): ProjectWorkspace {
  const index = projectCount + 1;
  const name = `project-${index}`;

  return {
    id: createId("project"),
    name,
    root: `~/Projects/${name}`,
    threads: [createThread(name, 0)],
  };
}

function getProjectDisplayName(project: ProjectWorkspace): string {
  const segments = project.root.split("/").filter(Boolean);
  const rootName = segments.at(-1);

  return rootName ?? project.name;
}

function getThreadCount(projects: ProjectWorkspace[]): number {
  return projects.reduce((count, project) => count + project.threads.length, 0);
}

function getActiveProject(projects: ProjectWorkspace[], view: AppView): ProjectWorkspace | null {
  if (view.kind !== "thread") {
    return null;
  }

  return projects.find((project) => project.id === view.projectId) ?? null;
}

function getActiveThread(project: ProjectWorkspace | null, view: AppView): ProjectThread | null {
  if (!project || view.kind !== "thread") {
    return null;
  }

  return project.threads.find((thread) => thread.id === view.threadId) ?? null;
}

type ProjectSidebarProps = {
  collapsedProjects: Record<string, boolean>;
  onCreateThread: (projectId: string) => void;
  onOpenSettings: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onToggleProject: (projectId: string) => void;
  projects: ProjectWorkspace[];
  view: AppView;
};

function ProjectSidebar({
  collapsedProjects,
  onCreateThread,
  onOpenSettings,
  onSelectProject,
  onSelectThread,
  onToggleProject,
  projects,
  view,
}: ProjectSidebarProps) {
  const activeProjectId = view.kind === "thread" ? view.projectId : null;
  const activeThreadId = view.kind === "thread" ? view.threadId : null;

  return (
    <div className="desktop-sidebar">
      <div className="desktop-sidebar-primary">
        {projects.map((project) => {
          const isCollapsed = collapsedProjects[project.id] ?? false;
          const isActiveProject = project.id === activeProjectId;
          const threadListId = `project-thread-list-${project.id}`;

          return (
            <section key={project.id} className="project-group">
              <div className="project-group-header">
                <button
                  type="button"
                  className={`project-group-name${isActiveProject ? " is-active" : ""}`}
                  onClick={() => onSelectProject(project.id)}
                >
                  {project.name}
                </button>
                <div className="project-group-actions">
                  <DesktopIconButton
                    controlsId={threadListId}
                    expanded={!isCollapsed}
                    icon={
                      isCollapsed ? (
                        <ChevronRight aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )
                    }
                    label={
                      isCollapsed
                        ? `Expand ${project.name} threads`
                        : `Collapse ${project.name} threads`
                    }
                    onClick={() => onToggleProject(project.id)}
                  />
                  <DesktopIconButton
                    icon={<MessageSquarePlus aria-hidden="true" />}
                    label={`Create thread in ${project.name}`}
                    onClick={() => onCreateThread(project.id)}
                  />
                </div>
              </div>

              <DesktopCollapsibleSection
                className="thread-list-disclosure"
                collapsed={isCollapsed}
                id={threadListId}
              >
                <div className="thread-list" role="list">
                  {project.threads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className={`thread-list-item${thread.id === activeThreadId ? " is-active" : ""}`}
                      onClick={() => onSelectThread(project.id, thread.id)}
                    >
                      <span className="thread-list-item-name">{thread.name}</span>
                      <span className="thread-list-item-meta">{thread.updatedLabel}</span>
                    </button>
                  ))}
                </div>
              </DesktopCollapsibleSection>
            </section>
          );
        })}
      </div>

      <div className="desktop-sidebar-footer">
        <DesktopSidebarButton
          active={view.kind === "settings"}
          icon={<Settings2 aria-hidden="true" />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </div>
  );
}

function ThreadView() {
  return <div className="thread-design-canvas" />;
}

function SettingsView() {
  return <div className="settings-design-canvas" />;
}

function ThreadInspectorSurface() {
  return <div className="thread-inspector-surface" />;
}

function ThreadTerminalSurface() {
  return <div className="thread-terminal-surface" />;
}

export function DesktopWorkbenchApp() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>(() =>
    INITIAL_PROJECTS[1] ? { [INITIAL_PROJECTS[1].id]: true } : {},
  );
  const [view, setView] = useState<AppView>({
    kind: "thread",
    projectId: INITIAL_PROJECTS[0].id,
    threadId: INITIAL_PROJECTS[0].threads[0].id,
  });

  const activeProject = getActiveProject(projects, view);
  const activeThread = getActiveThread(activeProject, view);

  function openSettings(): void {
    startTransition(() => {
      setView({ kind: "settings" });
    });
  }

  function selectProject(projectId: string): void {
    const project = projects.find((candidate) => candidate.id === projectId);
    const firstThread = project?.threads[0];

    if (!project || !firstThread) {
      return;
    }

    startTransition(() => {
      setCollapsedProjects((current) => ({ ...current, [projectId]: false }));
      setView({
        kind: "thread",
        projectId,
        threadId: firstThread.id,
      });
    });
  }

  function selectThread(projectId: string, threadId: string): void {
    startTransition(() => {
      setView({
        kind: "thread",
        projectId,
        threadId,
      });
    });
  }

  function toggleProject(projectId: string): void {
    setCollapsedProjects((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }));
  }

  function createProjectAction(): void {
    const nextProject = createProject(projects.length);
    const firstThread = nextProject.threads[0];

    startTransition(() => {
      setProjects((current) => [...current, nextProject]);
      setCollapsedProjects((current) => ({ ...current, [nextProject.id]: false }));
      setView({
        kind: "thread",
        projectId: nextProject.id,
        threadId: firstThread.id,
      });
    });
  }

  function createThreadAction(projectId: string): void {
    const project = projects.find((candidate) => candidate.id === projectId);

    if (!project) {
      return;
    }

    const nextThread = createThread(project.name, project.threads.length);

    startTransition(() => {
      setProjects((current) =>
        current.map((candidate) =>
          candidate.id === projectId
            ? {
                ...candidate,
                threads: [...candidate.threads, nextThread],
              }
            : candidate,
        ),
      );
      setCollapsedProjects((current) => ({ ...current, [projectId]: false }));
      setView({
        kind: "thread",
        projectId,
        threadId: nextThread.id,
      });
    });
  }

  const leftSidebarToolbarItems: DesktopBaseLayoutToolbarItem[] = [
    {
      content: (
        <DesktopIconButton
          icon={<FolderPlus aria-hidden="true" />}
          label="Create project"
          onClick={createProjectAction}
        />
      ),
      id: "create-project",
    },
  ];

  const toolbarItems: DesktopBaseLayoutToolbarItem[] =
    activeProject && activeThread && view.kind === "thread"
      ? [
          {
            content: (
              <span className="desktop-toolbar-context">
                {getProjectDisplayName(activeProject)}
              </span>
            ),
            id: "project-context",
          },
        ]
      : [];

  const centerContent =
    view.kind === "settings" || !activeProject || !activeThread ? <SettingsView /> : <ThreadView />;

  return (
    <DesktopBaseLayout
      bottomBar={
        view.kind === "thread" && activeProject && activeThread ? (
          <ThreadTerminalSurface />
        ) : undefined
      }
      bottomBarTitle="Terminal"
      center={centerContent}
      leftSidebar={
        <ProjectSidebar
          collapsedProjects={collapsedProjects}
          onCreateThread={createThreadAction}
          onOpenSettings={openSettings}
          onSelectProject={selectProject}
          onSelectThread={selectThread}
          onToggleProject={toggleProject}
          projects={projects}
          view={view}
        />
      }
      leftSidebarTitle="Projects"
      leftSidebarToolbarItems={leftSidebarToolbarItems}
      rightSidebar={
        view.kind === "thread" && activeProject && activeThread ? (
          <ThreadInspectorSurface />
        ) : undefined
      }
      rightSidebarTitle={view.kind === "thread" && activeThread ? activeThread.name : undefined}
      showMainTopbar={view.kind !== "settings"}
      title={view.kind === "thread" && activeThread ? activeThread.name : "Projects"}
      toolbarItems={toolbarItems}
    />
  );
}
