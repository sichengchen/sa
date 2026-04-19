import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderPlus,
  Inbox,
  MessageSquare,
  MessageSquarePlus,
  Plug2,
  Settings2,
} from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import type {
  AriaDesktopProjectGroup,
  AriaDesktopProjectShellState,
  AriaDesktopProjectThreadItem,
} from "../../../shared/api.js";
import { DesktopBaseLayout, type DesktopBaseLayoutToolbarItem } from "./DesktopBaseLayout.js";
import { DesktopCollapsibleSection } from "./DesktopCollapsibleSection.js";
import { DesktopIconButton } from "./DesktopIconButton.js";
import { DesktopSpaceTabs, type DesktopSpace } from "./DesktopSpaceTabs.js";
import { DesktopSidebarButton } from "./DesktopSidebarButton.js";

type AriaScreen = "automations" | "chat" | "connectors" | "inbox";

const EMPTY_SHELL_STATE: AriaDesktopProjectShellState = {
  collapsedProjectIds: [],
  projects: [],
  selectedProjectId: null,
  selectedThreadId: null,
};

function formatRelativeUpdatedAt(updatedAt: number): string {
  const differenceMs = Date.now() - updatedAt;

  if (differenceMs < 60_000) {
    return "now";
  }

  const differenceMinutes = Math.floor(differenceMs / 60_000);

  if (differenceMinutes < 60) {
    return `${differenceMinutes}m`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return `${differenceHours}h`;
  }

  return `${Math.floor(differenceHours / 24)}d`;
}

type ThreadViewProps = {
  onImportProject: () => void;
  selectedProject: AriaDesktopProjectGroup | null;
  selectedThread: AriaDesktopProjectThreadItem | null;
};

function ThreadView({ onImportProject, selectedProject, selectedThread }: ThreadViewProps) {
  if (!selectedProject) {
    return (
      <div className="thread-design-canvas thread-empty-state">
        <button type="button" className="thread-empty-state-action" onClick={onImportProject}>
          <FolderPlus aria-hidden="true" />
          <span>Import project</span>
        </button>
      </div>
    );
  }

  if (!selectedThread) {
    return (
      <div className="thread-design-canvas thread-empty-state">
        <div className="thread-empty-state-content">
          <h2 className="thread-empty-state-title">{selectedProject.name}</h2>
          <p className="thread-empty-state-copy">
            Create a thread from the project row to start work.
          </p>
        </div>
      </div>
    );
  }

  return <div className="thread-design-canvas" />;
}

function SettingsView() {
  return <div className="settings-design-canvas" />;
}

function getAriaScreenLabel(screen: AriaScreen): string {
  switch (screen) {
    case "chat":
      return "Chat";
    case "inbox":
      return "Inbox";
    case "automations":
      return "Automations";
    case "connectors":
      return "Connectors";
  }
}

type AriaViewProps = {
  activeScreen: AriaScreen;
};

function AriaView({ activeScreen }: AriaViewProps) {
  return (
    <div className="aria-design-canvas thread-empty-state">
      <div className="thread-empty-state-content">
        <h2 className="thread-empty-state-title">{getAriaScreenLabel(activeScreen)}</h2>
        <p className="thread-empty-state-copy">Aria workspace surfaces will render here.</p>
      </div>
    </div>
  );
}

function ThreadInspectorSurface() {
  return <div className="thread-inspector-surface" />;
}

function ThreadTerminalSurface() {
  return <div className="thread-terminal-surface" />;
}

type ProjectSidebarProps = {
  collapsedProjectIds: string[];
  onCreateThread: (projectId: string) => void;
  onOpenSettings: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onToggleProject: (projectId: string, collapsed: boolean) => void;
  projects: AriaDesktopProjectGroup[];
  settingsActive: boolean;
  selectedProjectId: string | null;
  selectedThreadId: string | null;
};

function ProjectSidebar({
  collapsedProjectIds,
  onCreateThread,
  onOpenSettings,
  onSelectProject,
  onSelectThread,
  onToggleProject,
  projects,
  settingsActive,
  selectedProjectId,
  selectedThreadId,
}: ProjectSidebarProps) {
  const collapsedProjectIdSet = new Set(collapsedProjectIds);

  return (
    <div className="desktop-sidebar">
      <div className="desktop-sidebar-primary">
        {projects.map((project) => {
          const isCollapsed = collapsedProjectIdSet.has(project.projectId);
          const isSelectedProject = project.projectId === selectedProjectId;
          const threadListId = `project-thread-list-${project.projectId}`;

          return (
            <section key={project.projectId} className="project-group">
              <div className="project-group-header">
                <button
                  type="button"
                  className={`project-group-name${isSelectedProject ? " is-active" : ""}`}
                  onClick={() => onSelectProject(project.projectId)}
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
                    onClick={() => onToggleProject(project.projectId, !isCollapsed)}
                  />
                  <DesktopIconButton
                    icon={<MessageSquarePlus aria-hidden="true" />}
                    label={`Create thread in ${project.name}`}
                    onClick={() => onCreateThread(project.projectId)}
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
                    <ThreadListItem
                      key={thread.threadId}
                      isActive={thread.threadId === selectedThreadId}
                      onSelect={() => onSelectThread(project.projectId, thread.threadId)}
                      thread={thread}
                    />
                  ))}
                </div>
              </DesktopCollapsibleSection>
            </section>
          );
        })}
      </div>

      <div className="desktop-sidebar-footer">
        <DesktopSidebarButton
          active={settingsActive}
          icon={<Settings2 aria-hidden="true" />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </div>
  );
}

type AriaSidebarProps = {
  activeScreen: AriaScreen;
  onOpenSettings: () => void;
  onSelectScreen: (screen: AriaScreen) => void;
  settingsActive: boolean;
};

const ARIA_SIDEBAR_SCREENS: ReadonlyArray<{ icon: JSX.Element; id: AriaScreen; label: string }> = [
  { icon: <MessageSquare aria-hidden="true" />, id: "chat", label: "Chat" },
  { icon: <Inbox aria-hidden="true" />, id: "inbox", label: "Inbox" },
  { icon: <Clock3 aria-hidden="true" />, id: "automations", label: "Automations" },
  { icon: <Plug2 aria-hidden="true" />, id: "connectors", label: "Connectors" },
];

function AriaSidebar({
  activeScreen,
  onOpenSettings,
  onSelectScreen,
  settingsActive,
}: AriaSidebarProps) {
  return (
    <div className="desktop-sidebar">
      <div className="desktop-sidebar-primary">
        <div className="desktop-sidebar-section">
          {ARIA_SIDEBAR_SCREENS.map((screen) => (
            <DesktopSidebarButton
              key={screen.id}
              active={!settingsActive && activeScreen === screen.id}
              icon={screen.icon}
              label={screen.label}
              onClick={() => onSelectScreen(screen.id)}
            />
          ))}
        </div>
      </div>

      <div className="desktop-sidebar-footer">
        <DesktopSidebarButton
          active={settingsActive}
          icon={<Settings2 aria-hidden="true" />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </div>
  );
}

type ThreadListItemProps = {
  isActive: boolean;
  onSelect: () => void;
  thread: AriaDesktopProjectThreadItem;
};

function ThreadListItem({ isActive, onSelect, thread }: ThreadListItemProps) {
  return (
    <button
      type="button"
      className={`thread-list-item${isActive ? " is-active" : ""}`}
      onClick={onSelect}
    >
      <span className="thread-list-item-name">{thread.title}</span>
      <span className="thread-list-item-meta">{formatRelativeUpdatedAt(thread.updatedAt)}</span>
    </button>
  );
}

function getSelectedProject(
  shellState: AriaDesktopProjectShellState,
): AriaDesktopProjectGroup | null {
  return (
    shellState.projects.find((project) => project.projectId === shellState.selectedProjectId) ??
    null
  );
}

function getSelectedThread(
  project: AriaDesktopProjectGroup | null,
  shellState: AriaDesktopProjectShellState,
): AriaDesktopProjectThreadItem | null {
  if (!project) {
    return null;
  }

  return project.threads.find((thread) => thread.threadId === shellState.selectedThreadId) ?? null;
}

export function DesktopWorkbenchApp() {
  const [activeAriaScreen, setActiveAriaScreen] = useState<AriaScreen>("chat");
  const [activeSpace, setActiveSpace] = useState<DesktopSpace>("projects");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shellState, setShellState] = useState<AriaDesktopProjectShellState>(EMPTY_SHELL_STATE);

  const selectedProject = getSelectedProject(shellState);
  const selectedThread = getSelectedThread(selectedProject, shellState);

  useEffect(() => {
    let isDisposed = false;

    async function loadProjectShellState(): Promise<void> {
      if (!window.ariaDesktop) {
        return;
      }

      const nextShellState = await window.ariaDesktop.getProjectShellState();

      if (isDisposed) {
        return;
      }

      startTransition(() => {
        setShellState(nextShellState);
      });
    }

    void loadProjectShellState();

    return () => {
      isDisposed = true;
    };
  }, []);

  async function openProjectsShell(
    loader: () => Promise<AriaDesktopProjectShellState>,
  ): Promise<void> {
    if (!window.ariaDesktop) {
      return;
    }

    try {
      const nextShellState = await loader();

      startTransition(() => {
        setActiveSpace("projects");
        setSettingsOpen(false);
        setShellState(nextShellState);
      });
    } catch (error) {
      console.error(error);
    }
  }

  function openSettings(): void {
    startTransition(() => {
      setSettingsOpen(true);
    });
  }

  function selectSpace(space: DesktopSpace): void {
    startTransition(() => {
      setActiveSpace(space);
      setSettingsOpen(false);
    });
  }

  function selectAriaScreen(screen: AriaScreen): void {
    startTransition(() => {
      setActiveAriaScreen(screen);
      setActiveSpace("aria");
      setSettingsOpen(false);
    });
  }

  function importProject(): void {
    void openProjectsShell(() => window.ariaDesktop.importLocalProjectFromDialog());
  }

  function createThread(projectId: string): void {
    void openProjectsShell(() => window.ariaDesktop.createThread(projectId));
  }

  function selectProject(projectId: string): void {
    void openProjectsShell(() => window.ariaDesktop.selectProject(projectId));
  }

  function selectThread(projectId: string, threadId: string): void {
    void openProjectsShell(() => window.ariaDesktop.selectThread(projectId, threadId));
  }

  function toggleProject(projectId: string, collapsed: boolean): void {
    void window.ariaDesktop
      .setProjectCollapsed(projectId, collapsed)
      .then((nextShellState) => {
        startTransition(() => {
          setShellState(nextShellState);
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  const leftSidebarToolbarItems: DesktopBaseLayoutToolbarItem[] =
    activeSpace === "projects"
      ? [
          {
            content: (
              <DesktopIconButton
                icon={<FolderPlus aria-hidden="true" />}
                label="Import project"
                onClick={importProject}
              />
            ),
            id: "import-project",
          },
        ]
      : [];

  const toolbarItems: DesktopBaseLayoutToolbarItem[] =
    !settingsOpen && activeSpace === "projects" && selectedProject
      ? [
          {
            content: <span className="desktop-toolbar-context">{selectedProject.name}</span>,
            id: "project-context",
          },
        ]
      : [];

  return (
    <DesktopBaseLayout
      bottomBar={
        !settingsOpen && activeSpace === "projects" && selectedThread ? (
          <ThreadTerminalSurface />
        ) : undefined
      }
      bottomBarTitle="Terminal"
      center={
        settingsOpen ? (
          <SettingsView />
        ) : activeSpace === "aria" ? (
          <AriaView activeScreen={activeAriaScreen} />
        ) : (
          <ThreadView
            onImportProject={importProject}
            selectedProject={selectedProject}
            selectedThread={selectedThread}
          />
        )
      }
      leftSidebar={
        activeSpace === "projects" ? (
          <ProjectSidebar
            collapsedProjectIds={shellState.collapsedProjectIds}
            onCreateThread={createThread}
            onOpenSettings={openSettings}
            onSelectProject={selectProject}
            onSelectThread={selectThread}
            onToggleProject={toggleProject}
            projects={shellState.projects}
            settingsActive={settingsOpen}
            selectedProjectId={shellState.selectedProjectId}
            selectedThreadId={shellState.selectedThreadId}
          />
        ) : (
          <AriaSidebar
            activeScreen={activeAriaScreen}
            onOpenSettings={openSettings}
            onSelectScreen={selectAriaScreen}
            settingsActive={settingsOpen}
          />
        )
      }
      leftSidebarTitle={<DesktopSpaceTabs activeSpace={activeSpace} onSelectSpace={selectSpace} />}
      leftSidebarToolbarItems={leftSidebarToolbarItems}
      rightSidebar={
        !settingsOpen && activeSpace === "projects" && selectedThread ? (
          <ThreadInspectorSurface />
        ) : undefined
      }
      rightSidebarTitle={
        !settingsOpen && activeSpace === "projects" && selectedThread
          ? selectedThread.title
          : undefined
      }
      showMainTopbar={!settingsOpen}
      title={
        activeSpace === "projects"
          ? (selectedThread?.title ?? selectedProject?.name ?? "Projects")
          : getAriaScreenLabel(activeAriaScreen)
      }
      toolbarItems={toolbarItems}
    />
  );
}
