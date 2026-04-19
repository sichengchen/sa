import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderPlus,
  MessageSquarePlus,
  Plug2,
  Settings2,
} from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import type {
  AriaDesktopAriaShellState,
  AriaDesktopAriaScreen,
  AriaDesktopAutomationTask,
  AriaDesktopProjectGroup,
  AriaDesktopProjectShellState,
  AriaDesktopProjectThreadItem,
} from "../../../shared/api.js";
import { DesktopBaseLayout, type DesktopBaseLayoutToolbarItem } from "./DesktopBaseLayout.js";
import { DesktopSpaceTabs, type DesktopSpace } from "./DesktopSpaceTabs.js";
import { DesktopSidebarButton } from "./DesktopSidebarButton.js";
import { DesktopIconButton } from "./DesktopIconButton.js";
import { DesktopCollapsibleSection } from "./DesktopCollapsibleSection.js";
import { DesktopSidebarSectionHeader } from "./DesktopSidebarSectionHeader.js";
import { DesktopThreadListItem } from "./DesktopThreadListItem.js";
import { AriaChatThreadSection } from "./AriaChatThreadSection.js";
import { AriaChatComposer } from "./AriaChatComposer.js";
import { AriaMessageStream } from "./AriaMessageStream.js";

const EMPTY_SHELL_STATE: AriaDesktopProjectShellState = {
  collapsedProjectIds: [],
  projects: [],
  selectedProjectId: null,
  selectedThreadId: null,
};

const EMPTY_ARIA_STATE: AriaDesktopAriaShellState = {
  automations: {
    lastError: null,
    runs: [],
    selectedTaskId: null,
    tasks: [],
  },
  chat: {
    agentName: "Esperta Aria",
    approvalMode: "ask",
    connected: false,
    isStreaming: false,
    lastError: null,
    messages: [],
    modelName: "unknown",
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default",
    securityModeRemainingTTL: null,
    sessionId: null,
    sessionStatus: "disconnected",
    streamingText: "",
  },
  chatSessions: [],
  connectorSessions: [],
  connectors: {
    agentName: "Esperta Aria",
    approvalMode: "ask",
    connected: false,
    isStreaming: false,
    lastError: null,
    messages: [],
    modelName: "unknown",
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default",
    securityModeRemainingTTL: null,
    sessionId: null,
    sessionStatus: "disconnected",
    streamingText: "",
  },
  selectedAriaScreen: null,
  selectedAriaSessionId: null,
  serverLabel: "Local Server",
};

function formatRelativeUpdatedAt(updatedAt?: number | null): string | null {
  if (!updatedAt) {
    return null;
  }

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

function isEmptyChat(
  state: AriaDesktopAriaShellState["chat"] | AriaDesktopAriaShellState["connectors"],
): boolean {
  return state.messages.length === 0 && !state.streamingText;
}

function isAriaServerConnected(state: AriaDesktopAriaShellState): boolean {
  return state.chat.connected;
}

function getActiveAriaSessionTitle(
  sessions: AriaDesktopAriaShellState["chatSessions"] | AriaDesktopAriaShellState["connectorSessions"],
  sessionId: string | null,
): string | null {
  if (!sessionId) {
    return null;
  }

  return sessions.find((session) => session.sessionId === sessionId)?.title ?? null;
}

function summarizeConnectorStatuses(
  sessions: AriaDesktopAriaShellState["connectorSessions"],
): Array<{ connectorType: string; count: number; lastActiveAt: number | null }> {
  const byType = new Map<string, { connectorType: string; count: number; lastActiveAt: number | null }>();

  for (const session of sessions) {
    const existing = byType.get(session.connectorType);
    if (!existing) {
      byType.set(session.connectorType, {
        connectorType: session.connectorType,
        count: 1,
        lastActiveAt: session.lastActiveAt ?? null,
      });
      continue;
    }

    existing.count += 1;
    if ((session.lastActiveAt ?? 0) > (existing.lastActiveAt ?? 0)) {
      existing.lastActiveAt = session.lastActiveAt ?? null;
    }
  }

  return Array.from(byType.values()).sort((left, right) => (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0));
}

function buildOptimisticMessage(content: string) {
  return {
    content,
    id: `optimistic-user:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    role: "user" as const,
    toolName: null,
  };
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

export function ProjectSidebar({
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
        {projects.map((project, index) => {
          const isCollapsed = collapsedProjectIdSet.has(project.projectId);
          const isSelectedProject = project.projectId === selectedProjectId;
          const threadListId = `project-thread-list-${project.projectId}`;

          return (
            <section
              key={project.projectId}
              className={`desktop-thread-section${index > 0 ? " has-divider" : ""}`}
            >
              <DesktopSidebarSectionHeader
                actions={
                  <>
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
                  </>
                }
                title={
                  <button
                    type="button"
                    className={`desktop-sidebar-section-title-button${isSelectedProject ? " is-active" : ""}`}
                    onClick={() => onSelectProject(project.projectId)}
                  >
                    {project.name}
                  </button>
                }
              />

              <DesktopCollapsibleSection
                className="thread-list-disclosure"
                collapsed={isCollapsed}
                id={threadListId}
              >
                <div className="thread-list" role="list">
                  {project.threads.map((thread) => (
                    <DesktopThreadListItem
                      key={thread.threadId}
                      active={thread.threadId === selectedThreadId}
                      meta={formatRelativeUpdatedAt(thread.updatedAt)}
                      onSelect={() => onSelectThread(project.projectId, thread.threadId)}
                      title={thread.title}
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
  ariaState: AriaDesktopAriaShellState;
  ariaServerConnected: boolean;
  onCreateChat: () => void;
  onOpenSettings: () => void;
  onSearchChatSessions: (query: string) => void;
  onSelectChatSession: (sessionId: string) => void;
  onSelectConnectorScreen: () => void;
  onSelectScreen: (screen: AriaDesktopAriaScreen) => void;
  settingsActive: boolean;
};

export function AriaSidebar({
  ariaState,
  ariaServerConnected,
  onCreateChat,
  onOpenSettings,
  onSearchChatSessions,
  onSelectChatSession,
  onSelectConnectorScreen,
  onSelectScreen,
  settingsActive,
}: AriaSidebarProps) {
  return (
    <div className="desktop-sidebar">
      <div className="desktop-sidebar-primary">
        <div className="desktop-sidebar-section">
          <DesktopSidebarButton
            active={ariaState.selectedAriaScreen === "automations"}
            disabled={!ariaServerConnected}
            icon={<Clock3 aria-hidden="true" />}
            label="Automations"
            onClick={() => onSelectScreen("automations")}
          />
          <DesktopSidebarButton
            active={ariaState.selectedAriaScreen === "connectors"}
            disabled={!ariaServerConnected}
            icon={<Plug2 aria-hidden="true" />}
            label="Connectors"
            onClick={onSelectConnectorScreen}
          />
        </div>

        <div className="desktop-sidebar-divider" />

        <AriaChatThreadSection
          disabled={!ariaServerConnected}
          formatMeta={formatRelativeUpdatedAt}
          onCreateChat={onCreateChat}
          onSelectSession={onSelectChatSession}
          selectedSessionId={ariaState.selectedAriaSessionId}
          sessions={ariaState.chatSessions.map((session) => ({
            ...session,
            preview: null,
          }))}
        />
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

function NoAriaServerView() {
  return (
    <div className="thread-empty-state">
      <div className="thread-empty-state-content">
        <p className="thread-empty-state-copy">No Aria server connected</p>
      </div>
    </div>
  );
}

function AriaInspectorSurface({
  chat,
  serverLabel,
}: {
  chat: AriaDesktopAriaShellState["chat"] | AriaDesktopAriaShellState["connectors"];
  serverLabel: string;
}) {
  return (
    <div className="aria-inspector">
      <dl className="aria-inspector-grid">
        <div>
          <dt>Server</dt>
          <dd>{serverLabel}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{chat.sessionId ?? "None"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{chat.modelName}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{chat.sessionStatus}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AriaChatView({
  chat,
  emptyPlaceholder,
  onAcceptForSession,
  onAnswerQuestion,
  onApproveToolCall,
  onSendMessage,
}: {
  chat: AriaDesktopAriaShellState["chat"];
  emptyPlaceholder: string;
  onAcceptForSession: (toolCallId: string) => void;
  onAnswerQuestion: (questionId: string, answer: string) => void;
  onApproveToolCall: (toolCallId: string, approved: boolean) => void;
  onSendMessage: (message: string) => void;
}) {
  const [optimisticMessages, setOptimisticMessages] = useState<
    ReturnType<typeof buildOptimisticMessage>[]
  >([]);
  const effectiveChat =
    optimisticMessages.length > 0
      ? {
          ...chat,
          messages: [...chat.messages, ...optimisticMessages],
        }
      : chat;

  useEffect(() => {
    setOptimisticMessages((current) =>
      current.filter(
        (pendingMessage) =>
          !chat.messages.some(
            (message) => message.role === "user" && message.content === pendingMessage.content,
          ),
      ),
    );
  }, [chat.messages]);

  function handleSendMessage(message: string): void {
    setOptimisticMessages((current) => [...current, buildOptimisticMessage(message)]);
    onSendMessage(message);
  }

  if (isEmptyChat(effectiveChat)) {
    return (
      <div className="aria-chat-empty-state">
        <AriaChatComposer
          centered
          onSend={handleSendMessage}
          placeholder={emptyPlaceholder}
          title="What should we work on?"
        />
      </div>
    );
  }

  return (
    <div className="aria-chat-view">
      <AriaMessageStream
        chat={effectiveChat}
        onAcceptForSession={onAcceptForSession}
        onAnswerQuestion={onAnswerQuestion}
        onApproveToolCall={onApproveToolCall}
      />
      <AriaChatComposer onSend={handleSendMessage} placeholder={emptyPlaceholder} />
    </div>
  );
}

function AutomationsView({
  automations,
  onRefresh,
  onSelectTask,
}: {
  automations: AriaDesktopAriaShellState["automations"];
  onRefresh: () => void;
  onSelectTask: (taskId: string) => void;
}) {
  const selectedTask =
    automations.tasks.find((task) => task.taskId === automations.selectedTaskId) ?? null;

  return (
    <div className="aria-split-view">
      <section className="aria-split-list">
        <div className="aria-split-toolbar">
          <span className="aria-split-title">Automations</span>
          <button type="button" className="aria-toolbar-button" onClick={onRefresh}>
            Refresh
          </button>
        </div>
        <div className="aria-split-items">
          {automations.tasks.map((task) => (
            <button
              key={task.taskId}
              type="button"
              className={`aria-split-item${task.taskId === automations.selectedTaskId ? " is-active" : ""}`}
              onClick={() => onSelectTask(task.taskId)}
            >
              <span>{task.name}</span>
              <span>{task.lastStatus ?? "idle"}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="aria-split-detail">
        {selectedTask ? (
          <>
            <div className="aria-detail-header">
              <h2>{selectedTask.name}</h2>
              <p>{selectedTask.taskType}</p>
            </div>
            <div className="aria-run-list">
              {automations.runs.map((run) => (
                <article key={run.taskRunId} className="aria-run-card">
                  <strong>{run.status}</strong>
                  <span>{run.trigger}</span>
                  <span>{run.summary ?? run.errorMessage ?? "No summary"}</span>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="thread-empty-state">
            <div className="thread-empty-state-content">
              <h2 className="thread-empty-state-title">Automations</h2>
              <p className="thread-empty-state-copy">
                {automations.lastError ?? "Select an automation to inspect recent runs."}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ConnectorsView({
  connectorSessions,
  connectors,
  onSendMessage,
}: {
  connectorSessions: AriaDesktopAriaShellState["connectorSessions"];
  connectors: AriaDesktopAriaShellState["connectors"];
  onSendMessage: (message: string) => void;
}) {
  const connectorStatuses = summarizeConnectorStatuses(connectorSessions);
  const [optimisticMessages, setOptimisticMessages] = useState<
    ReturnType<typeof buildOptimisticMessage>[]
  >([]);
  const effectiveConnectors =
    optimisticMessages.length > 0
      ? {
          ...connectors,
          messages: [...connectors.messages, ...optimisticMessages],
        }
      : connectors;

  useEffect(() => {
    setOptimisticMessages((current) =>
      current.filter(
        (pendingMessage) =>
          !connectors.messages.some(
            (message) => message.role === "user" && message.content === pendingMessage.content,
          ),
      ),
    );
  }, [connectors.messages]);

  if (connectorStatuses.length === 0) {
    return (
      <div className="thread-empty-state">
        <div className="thread-empty-state-content">
          <h2 className="thread-empty-state-title">Connectors</h2>
          <p className="thread-empty-state-copy">
            No connector activity yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="aria-split-view is-single">
      <section className="aria-split-detail">
        <div className="aria-detail-header">
          <h2>Connectors</h2>
          <p>Current connector status and recent activity.</p>
        </div>
        <div className="aria-run-list">
          {connectorStatuses.map((status) => (
            <article key={status.connectorType} className="aria-run-card">
              <strong>{status.connectorType}</strong>
              <span>{status.count} threads</span>
              <span>{formatRelativeUpdatedAt(status.lastActiveAt) ?? "idle"}</span>
            </article>
          ))}
        </div>
        {effectiveConnectors.sessionId ? (
          <AriaChatComposer
            onSend={(message) => {
              setOptimisticMessages((current) => [...current, buildOptimisticMessage(message)]);
              onSendMessage(message);
            }}
            placeholder="Reply to connector"
          />
        ) : null}
      </section>
    </div>
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
  const [activeSpace, setActiveSpace] = useState<DesktopSpace>("projects");
  const [ariaState, setAriaState] = useState<AriaDesktopAriaShellState>(EMPTY_ARIA_STATE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shellState, setShellState] = useState<AriaDesktopProjectShellState>(EMPTY_SHELL_STATE);

  const selectedProject = getSelectedProject(shellState);
  const selectedThread = getSelectedThread(selectedProject, shellState);

  useEffect(() => {
    let isDisposed = false;

    async function loadShells(): Promise<void> {
      if (!window.ariaDesktop) {
        return;
      }

      const [nextShellState, nextAriaState] = await Promise.all([
        window.ariaDesktop.getProjectShellState(),
        window.ariaDesktop.getAriaShellState(),
      ]);

      if (isDisposed) {
        return;
      }

      startTransition(() => {
        setAriaState(nextAriaState);
        setShellState(nextShellState);
      });
    }

    void loadShells();

    return () => {
      isDisposed = true;
    };
  }, []);

  async function applyProjectShellState(
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

  async function applyAriaShellState(
    loader: () => Promise<AriaDesktopAriaShellState>,
  ): Promise<void> {
    if (!window.ariaDesktop) {
      return;
    }

    try {
      const nextAriaState = await loader();
      startTransition(() => {
        setActiveSpace("aria");
        setSettingsOpen(false);
        setAriaState(nextAriaState);
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

  function importProject(): void {
    void applyProjectShellState(() => window.ariaDesktop.importLocalProjectFromDialog());
  }

  function createThread(projectId: string): void {
    void applyProjectShellState(() => window.ariaDesktop.createThread(projectId));
  }

  function selectProject(projectId: string): void {
    void applyProjectShellState(() => window.ariaDesktop.selectProject(projectId));
  }

  function selectThread(projectId: string, threadId: string): void {
    void applyProjectShellState(() => window.ariaDesktop.selectThread(projectId, threadId));
  }

  function toggleProject(projectId: string, collapsed: boolean): void {
    void applyProjectShellState(() => window.ariaDesktop.setProjectCollapsed(projectId, collapsed));
  }

  function createAriaChat(): void {
    void applyAriaShellState(() => window.ariaDesktop.createAriaChatSession());
  }

  function selectAriaChat(sessionId: string): void {
    void applyAriaShellState(() => window.ariaDesktop.selectAriaChatSession(sessionId));
  }

  function selectAriaScreen(screen: AriaDesktopAriaScreen): void {
    void applyAriaShellState(() => window.ariaDesktop.selectAriaScreen(screen));
  }

  function refreshAutomations(): void {
    void applyAriaShellState(() => window.ariaDesktop.refreshAutomations());
  }

  function selectAutomationTask(task: AriaDesktopAutomationTask): void {
    void applyAriaShellState(() => window.ariaDesktop.selectAutomationTask(task.taskId));
  }

  function searchChatSessions(query: string): void {
    void applyAriaShellState(() => window.ariaDesktop.searchAriaChatSessions(query));
  }

  function searchConnectorSessions(query: string): void {
    void applyAriaShellState(() => window.ariaDesktop.searchConnectorSessions(query));
  }

  function sendAriaChatMessage(message: string): void {
    void window.ariaDesktop
      .sendAriaChatMessage(message)
      .then((nextAriaState) => {
        startTransition(() => {
          setAriaState(nextAriaState);
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function sendConnectorMessage(message: string): void {
    void window.ariaDesktop
      .sendConnectorMessage(message)
      .then((nextAriaState) => {
        startTransition(() => {
          setAriaState(nextAriaState);
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

  const showAriaChat =
    activeSpace === "aria" && !settingsOpen && ariaState.selectedAriaScreen === null;
  const showConnectorView =
    activeSpace === "aria" && !settingsOpen && ariaState.selectedAriaScreen === "connectors";
  const showAutomationView =
    activeSpace === "aria" && !settingsOpen && ariaState.selectedAriaScreen === "automations";
  const activeAriaChatTitle = getActiveAriaSessionTitle(
    ariaState.chatSessions,
    ariaState.selectedAriaSessionId,
  );
  const activeConnectorTitle = getActiveAriaSessionTitle(
    ariaState.connectorSessions,
    ariaState.connectors.sessionId,
  );
  const ariaServerConnected = isAriaServerConnected(ariaState);

  const toolbarItems: DesktopBaseLayoutToolbarItem[] =
    !settingsOpen && activeSpace === "projects" && selectedProject
      ? [
          {
            content: <span className="desktop-toolbar-context">{selectedProject.name}</span>,
            id: "project-context",
          },
        ]
      : !settingsOpen && activeSpace === "aria"
        ? [
            {
              content: <span className="desktop-toolbar-context">{ariaState.serverLabel}</span>,
              id: "aria-context",
            },
          ]
        : [];

  return (
    <DesktopBaseLayout
      bottomBar={
        activeSpace === "projects" && selectedThread ? (
          <ThreadTerminalSurface />
        ) : undefined
      }
      bottomBarTitle={activeSpace === "projects" ? "Terminal" : "Compose"}
      center={
        settingsOpen ? (
          <SettingsView />
        ) : activeSpace === "projects" ? (
          <ThreadView
            onImportProject={importProject}
            selectedProject={selectedProject}
            selectedThread={selectedThread}
          />
        ) : !ariaServerConnected ? (
          <NoAriaServerView />
        ) : showAutomationView ? (
          <AutomationsView
            automations={ariaState.automations}
            onRefresh={refreshAutomations}
            onSelectTask={selectAutomationTask}
          />
        ) : showConnectorView ? (
          <ConnectorsView
            connectorSessions={ariaState.connectorSessions}
            connectors={ariaState.connectors}
            onSendMessage={sendConnectorMessage}
          />
        ) : (
          <AriaChatView
            chat={ariaState.chat}
            emptyPlaceholder="Message Aria"
            onAcceptForSession={(toolCallId) =>
              void applyAriaShellState(() =>
                window.ariaDesktop.acceptAriaChatToolCallForSession(toolCallId),
              )
            }
            onAnswerQuestion={(questionId, answer) =>
              void applyAriaShellState(() =>
                window.ariaDesktop.answerAriaChatQuestion(questionId, answer),
              )
            }
            onApproveToolCall={(toolCallId, approved) =>
              void applyAriaShellState(() =>
                window.ariaDesktop.approveAriaChatToolCall(toolCallId, approved),
              )
            }
            onSendMessage={sendAriaChatMessage}
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
            selectedProjectId={shellState.selectedProjectId}
            selectedThreadId={shellState.selectedThreadId}
            settingsActive={settingsOpen}
          />
        ) : (
          <AriaSidebar
            ariaState={ariaState}
            ariaServerConnected={ariaServerConnected}
            onCreateChat={createAriaChat}
            onOpenSettings={openSettings}
            onSearchChatSessions={searchChatSessions}
            onSelectChatSession={selectAriaChat}
            onSelectConnectorScreen={() => selectAriaScreen("connectors")}
            onSelectScreen={selectAriaScreen}
            settingsActive={settingsOpen}
          />
        )
      }
      leftSidebarTitle={<DesktopSpaceTabs activeSpace={activeSpace} onSelectSpace={selectSpace} />}
      leftSidebarToolbarItems={leftSidebarToolbarItems}
      rightSidebar={
        activeSpace === "projects" && selectedThread ? (
          <ThreadInspectorSurface />
        ) : showAriaChat ? (
          <AriaInspectorSurface chat={ariaState.chat} serverLabel={ariaState.serverLabel} />
        ) : undefined
      }
      rightSidebarTitle={
        activeSpace === "projects" && selectedThread
          ? selectedThread.title
          : showAriaChat
            ? "Session"
            : undefined
      }
      showMainTopbar={!settingsOpen}
      title={
        activeSpace === "projects"
          ? (selectedThread?.title ?? selectedProject?.name ?? "Projects")
          : showAutomationView
            ? "Automations"
            : showConnectorView
              ? (activeConnectorTitle ?? "Connectors")
              : (activeAriaChatTitle ?? "Chat")
      }
      toolbarItems={toolbarItems}
    />
  );
}
