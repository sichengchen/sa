import {
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderPlus,
  GitBranch,
  MessageSquarePlus,
  Pin,
  Plug2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  AriaDesktopAriaShellState,
  AriaDesktopAriaScreen,
  AriaDesktopProjectGroup,
  AriaDesktopProjectShellState,
  AriaDesktopProjectThreadItem,
  AriaDesktopProjectThreadState,
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
import { formatToolDisplayName } from "./AriaMessageItem.js";
import { AriaMessageStream } from "./AriaMessageStream.js";
import { useTransientScrollbar } from "./useTransientScrollbar.js";

const EMPTY_SHELL_STATE: AriaDesktopProjectShellState = {
  archivedThreadIds: [],
  collapsedProjectIds: [],
  pinnedThreadIds: [],
  projects: [],
  selectedProjectId: null,
  selectedThreadId: null,
  selectedThreadState: null,
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
    streamingPhase: null,
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
    streamingPhase: null,
  },
  selectedAriaScreen: null,
  selectedAriaSessionId: null,
  serverLabel: "Local Server",
};

const DEFAULT_BRANCH_PREFIX = "aria/";

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
  return state.messages.length === 0 && !state.streamingText && !state.isStreaming;
}

function isAriaServerConnected(state: AriaDesktopAriaShellState): boolean {
  return state.chat.connected;
}

function getActiveAriaSessionTitle(
  sessions:
    | AriaDesktopAriaShellState["chatSessions"]
    | AriaDesktopAriaShellState["connectorSessions"],
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
  const byType = new Map<
    string,
    { connectorType: string; count: number; lastActiveAt: number | null }
  >();

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

  return Array.from(byType.values()).sort(
    (left, right) => (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0),
  );
}

function buildOptimisticMessage(content: string) {
  return {
    content,
    id: `optimistic-user:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    role: "user" as const,
    toolName: null,
  };
}

function ComposerContextMenu({
  activeLabel,
  align = "start",
  icon,
  menuLabel,
  onSelect,
  options,
}: {
  activeLabel: string;
  align?: "end" | "start";
  icon: ReactNode;
  menuLabel: string;
  onSelect: (id: string) => void;
  options: Array<{
    description?: string | null;
    id: string;
    label: string;
    secondaryLabel?: string | null;
    selected: boolean;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<"down" | "up">("down");
  const [maxMenuHeight, setMaxMenuHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const rootElement = rootRef.current;
    if (rootElement) {
      const rect = rootElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const shouldOpenUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      const sixRowMenuHeight = 6 * 58;
      const availableHeight = shouldOpenUp ? spaceAbove - 20 : spaceBelow - 20;

      setOpenDirection(shouldOpenUp ? "up" : "down");
      setMaxMenuHeight(Math.max(160, Math.min(sixRowMenuHeight, availableHeight)));
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`project-thread-composer-menu is-${align}${open ? " is-open" : ""}${
        openDirection === "up" ? " opens-up" : ""
      }`}
    >
      <button
        type="button"
        className="project-thread-composer-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${menuLabel}: ${activeLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        <span className="project-thread-composer-trigger-label">{activeLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="project-thread-composer-dropdown" role="menu" aria-label={menuLabel}>
          <div className="project-thread-composer-dropdown-title">{menuLabel}</div>
          <div
            className="project-thread-composer-dropdown-options desktop-scroll-region"
            style={maxMenuHeight ? { maxHeight: `${maxMenuHeight}px` } : undefined}
          >
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`project-thread-composer-option${option.selected ? " is-selected" : ""}`}
                role="menuitemradio"
                aria-checked={option.selected}
                onClick={() => {
                  setOpen(false);
                  if (!option.selected) {
                    onSelect(option.id);
                  }
                }}
              >
                <span className="project-thread-composer-option-copy">
                  <span className="project-thread-composer-option-label">{option.label}</span>
                  {option.secondaryLabel ? (
                    <span className="project-thread-composer-option-secondary">
                      {option.secondaryLabel}
                    </span>
                  ) : null}
                </span>
                {option.selected ? (
                  <span className="project-thread-composer-option-check">
                    <Check aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BranchComposerMenu({
  activeLabel,
  onCreateBranch,
  onSelect,
  options,
}: {
  activeLabel: string;
  onCreateBranch: (branchName: string) => void;
  onSelect: (environmentId: string) => void;
  options: Array<{
    description?: string | null;
    id: string;
    label: string;
    selected: boolean;
  }>;
}) {
  const [branchName, setBranchName] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<"down" | "up">("down");
  const [maxMenuHeight, setMaxMenuHeight] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const rootElement = rootRef.current;
    if (rootElement) {
      const rect = rootElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const shouldOpenUp = spaceBelow < 360 && spaceAbove > spaceBelow;
      const sixRowMenuHeight = 6 * 58;
      const availableHeight = shouldOpenUp ? spaceAbove - 136 : spaceBelow - 136;

      setOpenDirection(shouldOpenUp ? "up" : "down");
      setMaxMenuHeight(Math.max(120, Math.min(sixRowMenuHeight, availableHeight)));
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && !popoverOpen) {
      setBranchName("");
      setBranchQuery("");
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setPopoverOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setPopoverOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen, popoverOpen]);

  useEffect(() => {
    if (!popoverOpen) {
      return;
    }

    setBranchName((current) => current || DEFAULT_BRANCH_PREFIX);
    inputRef.current?.focus();
  }, [popoverOpen]);

  function openBranchPopover(): void {
    setMenuOpen(false);
    setPopoverOpen(true);
  }

  function closeBranchPopover(): void {
    setPopoverOpen(false);
  }

  function applyDefaultPrefix(): void {
    setBranchName((current) => {
      const trimmed = current.trim();
      if (!trimmed) {
        return DEFAULT_BRANCH_PREFIX;
      }

      if (trimmed.startsWith(DEFAULT_BRANCH_PREFIX)) {
        return trimmed;
      }

      return `${DEFAULT_BRANCH_PREFIX}${trimmed.replace(/^\/+/, "")}`;
    });
    inputRef.current?.focus();
  }

  function submitBranch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedBranchName = branchName.trim();
    if (!trimmedBranchName) {
      return;
    }

    setPopoverOpen(false);
    setBranchName("");
    onCreateBranch(trimmedBranchName);
  }

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(branchQuery.trim().toLowerCase()),
  );

  return (
    <div
      ref={rootRef}
      className={`project-thread-composer-menu${menuOpen ? " is-open" : ""}${
        openDirection === "up" ? " opens-up" : ""
      }`}
    >
      <button
        type="button"
        className="project-thread-composer-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`Branch: ${activeLabel}`}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <GitBranch aria-hidden="true" />
        <span className="project-thread-composer-trigger-label">{activeLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="project-thread-composer-dropdown" role="menu" aria-label="Branch">
          <div className="project-thread-composer-branch-search">
            <Search aria-hidden="true" />
            <input
              className="project-thread-composer-branch-search-input"
              type="text"
              value={branchQuery}
              placeholder="Search branches"
              aria-label="Search branches"
              onChange={(event) => setBranchQuery(event.target.value)}
            />
          </div>
          <div className="project-thread-composer-dropdown-section-label">Branches</div>
          <div
            className="project-thread-composer-dropdown-options desktop-scroll-region"
            style={maxMenuHeight ? { maxHeight: `${maxMenuHeight}px` } : undefined}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`project-thread-composer-option${option.selected ? " is-selected" : ""}`}
                  role="menuitemradio"
                  aria-checked={option.selected}
                  onClick={() => {
                    setMenuOpen(false);
                    if (!option.selected) {
                      onSelect(option.id);
                    }
                  }}
                >
                  <span className="project-thread-composer-option-copy">
                    <span className="project-thread-composer-option-leading">
                      <GitBranch aria-hidden="true" />
                    </span>
                    <span className="project-thread-composer-option-label">{option.label}</span>
                  </span>
                  {option.selected ? (
                    <span className="project-thread-composer-option-check">
                      <Check aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="project-thread-composer-empty">No matching branches</div>
            )}
          </div>
          <div className="project-thread-composer-dropdown-footer">
            <button
              type="button"
              className="project-thread-composer-create-branch"
              onClick={openBranchPopover}
            >
              <Plus aria-hidden="true" />
              <span>Create and checkout new branch...</span>
            </button>
          </div>
        </div>
      ) : null}
      {popoverOpen ? (
        <div className="project-thread-branch-popover-backdrop">
          <form
            className="project-thread-branch-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-thread-branch-popover-title"
            onSubmit={submitBranch}
          >
            <div className="project-thread-branch-popover-header">
              <h2 id="project-thread-branch-popover-title">Create and checkout branch</h2>
              <button
                type="button"
                className="project-thread-branch-popover-close"
                aria-label="Close branch popover"
                onClick={closeBranchPopover}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="project-thread-branch-popover-body">
              <div className="project-thread-branch-popover-label-row">
                <label
                  className="project-thread-branch-popover-label"
                  htmlFor="project-thread-branch-name"
                >
                  Branch name
                </label>
                <button
                  type="button"
                  className="project-thread-branch-popover-prefix"
                  onClick={applyDefaultPrefix}
                >
                  Set prefix
                </button>
              </div>
              <input
                id="project-thread-branch-name"
                ref={inputRef}
                className="project-thread-branch-popover-input"
                type="text"
                value={branchName}
                placeholder={`${DEFAULT_BRANCH_PREFIX}create-and-checkout-branch`}
                onChange={(event) => setBranchName(event.target.value)}
              />
            </div>
            <div className="project-thread-branch-popover-actions">
              <button
                type="submit"
                className="project-thread-branch-popover-button is-primary"
                disabled={branchName.trim().length === 0}
              >
                Create and checkout
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

type ThreadViewProps = {
  onCreateBranch: (threadId: string, branchName: string) => void;
  onImportProject: () => void;
  onSetModel: (threadId: string, modelId: string | null) => void;
  onSendMessage: (threadId: string, message: string) => void;
  onSwitchEnvironment: (threadId: string, environmentId: string) => void;
  selectedProject: AriaDesktopProjectGroup | null;
  selectedThreadState: AriaDesktopProjectThreadState | null;
};

export function ThreadView({
  onCreateBranch,
  onImportProject,
  onSetModel,
  onSendMessage,
  onSwitchEnvironment,
  selectedProject,
  selectedThreadState,
}: ThreadViewProps) {
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

  if (!selectedThreadState) {
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
  const selectedBranch =
    selectedThreadState.availableBranches.find((option) => option.selected) ??
    selectedThreadState.availableBranches[0] ??
    null;
  const selectedModel =
    selectedThreadState.availableModels.find((option) => option.selected) ??
    selectedThreadState.availableModels[0] ??
    null;

  return (
    <div className="thread-design-canvas project-thread-view">
      <AriaChatView
        chat={selectedThreadState.chat}
        composerFooterEnd={
          selectedModel ? (
            <ComposerContextMenu
              activeLabel={selectedModel.modelLabel ?? selectedModel.label}
              align="end"
              icon={<Sparkles aria-hidden="true" />}
              menuLabel="Model"
              onSelect={(modelId) => onSetModel(selectedThreadState.threadId, modelId || null)}
              options={selectedThreadState.availableModels.map((option) => ({
                description: null,
                id: option.modelId ?? "",
                label: option.modelLabel ?? option.label,
                secondaryLabel: option.providerLabel ?? null,
                selected: option.selected,
              }))}
            />
          ) : null
        }
        composerFooterStart={
          selectedBranch ? (
            <BranchComposerMenu
              activeLabel={selectedBranch.value}
              onCreateBranch={(branchName) =>
                onCreateBranch(selectedThreadState.threadId, branchName)
              }
              onSelect={(environmentId) =>
                onSwitchEnvironment(selectedThreadState.threadId, environmentId)
              }
              options={selectedThreadState.availableBranches.map((option) => ({
                id: option.environmentId,
                label: option.value,
                selected: option.selected,
              }))}
            />
          ) : null
        }
        emptyPlaceholder={`Message ${selectedThreadState.agentLabel ?? "Agent"}`}
        onAcceptForSession={() => {}}
        onAnswerQuestion={() => {}}
        onApproveToolCall={() => {}}
        promptSuggestions={selectedThreadState.promptSuggestions}
        onSendMessage={(message) => onSendMessage(selectedThreadState.threadId, message)}
      />
    </div>
  );
}

function SettingsView() {
  return <div className="settings-design-canvas" />;
}

function ThreadInspectorSurface({ thread }: { thread: AriaDesktopProjectThreadState }) {
  return (
    <div className="thread-inspector-surface">
      <dl className="aria-inspector-grid">
        <div>
          <dt>Project</dt>
          <dd>{thread.projectName}</dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd>{thread.agentLabel ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{thread.environmentLabel ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{thread.statusLabel}</dd>
        </div>
        <div>
          <dt>Changed Files</dt>
          <dd>{thread.changedFiles.length}</dd>
        </div>
      </dl>
      {thread.changedFiles.length > 0 ? (
        <div className="thread-inspector-file-list">
          {thread.changedFiles.map((filePath) => (
            <div key={filePath} className="thread-inspector-file">
              {filePath}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ProjectSidebarProps = {
  collapsedProjectIds: string[];
  onArchiveThread: (threadId: string) => void;
  onCreateThread: (projectId: string) => void;
  onOpenSettings: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onTogglePinnedThread: (threadId: string, pinned: boolean) => void;
  onToggleProject: (projectId: string, collapsed: boolean) => void;
  projects: AriaDesktopProjectGroup[];
  settingsActive: boolean;
  selectedProjectId: string | null;
  selectedThreadId: string | null;
};

export function ProjectSidebar({
  collapsedProjectIds,
  onArchiveThread,
  onCreateThread,
  onOpenSettings,
  onSelectProject,
  onSelectThread,
  onTogglePinnedThread,
  onToggleProject,
  projects,
  settingsActive,
  selectedProjectId,
  selectedThreadId,
}: ProjectSidebarProps) {
  const { onScroll, scrollRef } = useTransientScrollbar<HTMLDivElement>();
  const collapsedProjectIdSet = new Set(collapsedProjectIds);

  return (
    <div className="desktop-sidebar">
      <div
        ref={scrollRef}
        className="desktop-sidebar-primary desktop-scroll-region"
        onScroll={onScroll}
      >
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
                      trailingAction={
                        <div className="thread-list-item-actions">
                          <DesktopIconButton
                            active={Boolean(thread.pinned)}
                            className="thread-list-item-action"
                            icon={<Pin aria-hidden="true" />}
                            label={thread.pinned ? `Unpin ${thread.title}` : `Pin ${thread.title}`}
                            onClick={() => onTogglePinnedThread(thread.threadId, !thread.pinned)}
                          />
                          <DesktopIconButton
                            className="thread-list-item-action"
                            icon={<Archive aria-hidden="true" />}
                            label={`Archive ${thread.title}`}
                            onClick={() => onArchiveThread(thread.threadId)}
                          />
                        </div>
                      }
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
  pinnedSessionIds?: string[];
  onArchiveChatSession: (sessionId: string) => void;
  onCreateChat: () => void;
  onOpenSettings: () => void;
  onSearchChatSessions: (query: string) => void;
  onSelectChatSession: (sessionId: string) => void;
  onSelectConnectorScreen: () => void;
  onSelectScreen: (screen: AriaDesktopAriaScreen) => void;
  onTogglePinnedChatSession: (sessionId: string) => void;
  settingsActive: boolean;
};

export function AriaSidebar({
  ariaState,
  ariaServerConnected,
  pinnedSessionIds = [],
  onArchiveChatSession,
  onCreateChat,
  onOpenSettings,
  onSearchChatSessions,
  onSelectChatSession,
  onSelectConnectorScreen,
  onSelectScreen,
  onTogglePinnedChatSession,
  settingsActive,
}: AriaSidebarProps) {
  const { onScroll, scrollRef } = useTransientScrollbar<HTMLDivElement>();

  return (
    <div className="desktop-sidebar">
      <div
        ref={scrollRef}
        className="desktop-sidebar-primary desktop-scroll-region"
        onScroll={onScroll}
      >
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
          pinnedSessionIds={pinnedSessionIds}
          onArchiveSession={onArchiveChatSession}
          onCreateChat={onCreateChat}
          onSelectSession={onSelectChatSession}
          onTogglePinnedSession={onTogglePinnedChatSession}
          selectedSessionId={ariaState.selectedAriaSessionId}
          sessions={ariaState.chatSessions
            .filter((session) => !session.archived)
            .map((session) => ({
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

function AriaPendingQuestionPrompt({
  pendingQuestion,
  onAnswerQuestion,
}: {
  onAnswerQuestion: (questionId: string, answer: string) => void;
  pendingQuestion: NonNullable<AriaDesktopAriaShellState["chat"]["pendingQuestion"]>;
}) {
  const [answer, setAnswer] = useState("");

  const hasOptions = Boolean(pendingQuestion.options?.length);

  return (
    <section className="aria-question-prompt">
      <div className="aria-question-prompt-title">{pendingQuestion.question}</div>
      {hasOptions ? (
        <div className="aria-question-prompt-options">
          {pendingQuestion.options!.map((option) => (
            <button
              key={option}
              type="button"
              className="aria-question-prompt-option"
              onClick={() => onAnswerQuestion(pendingQuestion.questionId, option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="aria-question-prompt-shell"
          onSubmit={(event) => {
            event.preventDefault();
            if (!answer.trim()) {
              return;
            }
            onAnswerQuestion(pendingQuestion.questionId, answer.trim());
            setAnswer("");
          }}
        >
          <input
            className="aria-question-prompt-input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Type your answer"
          />
          <div className="aria-question-prompt-footer">
            <button type="submit" className="aria-chat-composer-submit" aria-label="Submit answer">
              <ArrowUp aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function AriaPendingApprovalPrompt({
  onAcceptForSession,
  onApproveToolCall,
  pendingApproval,
}: {
  onAcceptForSession: (toolCallId: string) => void;
  onApproveToolCall: (toolCallId: string, approved: boolean) => void;
  pendingApproval: NonNullable<AriaDesktopAriaShellState["chat"]["pendingApproval"]>;
}) {
  return (
    <section className="aria-action-prompt">
      <div className="aria-action-prompt-title">
        {formatToolDisplayName(pendingApproval.toolName)}
      </div>
      <pre className="aria-action-prompt-copy">{JSON.stringify(pendingApproval.args, null, 2)}</pre>
      <div className="aria-action-prompt-footer">
        <button
          type="button"
          className="aria-action-prompt-button"
          onClick={() => onApproveToolCall(pendingApproval.toolCallId, false)}
        >
          Deny
        </button>
        <button
          type="button"
          className="aria-action-prompt-button"
          onClick={() => onAcceptForSession(pendingApproval.toolCallId)}
        >
          Allow session
        </button>
        <button
          type="button"
          className="aria-action-prompt-button is-primary"
          onClick={() => onApproveToolCall(pendingApproval.toolCallId, true)}
        >
          Approve
        </button>
      </div>
    </section>
  );
}

export function AriaChatView({
  chat,
  composerFooterEnd = null,
  composerFooterStart = null,
  emptyPlaceholder,
  isArchived = false,
  onAcceptForSession,
  onAnswerQuestion,
  onApproveToolCall,
  promptSuggestions = null,
  onSendMessage,
}: {
  chat: AriaDesktopAriaShellState["chat"];
  composerFooterEnd?: ReactNode;
  composerFooterStart?: ReactNode;
  emptyPlaceholder: string;
  isArchived?: boolean;
  onAcceptForSession: (toolCallId: string) => void;
  onAnswerQuestion: (questionId: string, answer: string) => void;
  onApproveToolCall: (toolCallId: string, approved: boolean) => void;
  promptSuggestions?: AriaDesktopProjectThreadState["promptSuggestions"] | null;
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
          footerEnd={composerFooterEnd}
          footerStart={composerFooterStart}
          onSend={handleSendMessage}
          placeholder={emptyPlaceholder}
          promptSuggestions={promptSuggestions}
          title="What should we work on?"
        />
      </div>
    );
  }

  return (
    <div className="aria-chat-view">
      <AriaMessageStream chat={effectiveChat} />
      {chat.pendingApproval ? (
        <AriaPendingApprovalPrompt
          pendingApproval={chat.pendingApproval}
          onAcceptForSession={onAcceptForSession}
          onApproveToolCall={onApproveToolCall}
        />
      ) : null}
      {chat.pendingQuestion ? (
        <AriaPendingQuestionPrompt
          pendingQuestion={chat.pendingQuestion}
          onAnswerQuestion={onAnswerQuestion}
        />
      ) : null}
      {isArchived ? (
        <div className="aria-chat-readonly-label">archived session</div>
      ) : (
        <AriaChatComposer
          footerEnd={composerFooterEnd}
          footerStart={composerFooterStart}
          onSend={handleSendMessage}
          placeholder={emptyPlaceholder}
          promptSuggestions={promptSuggestions}
        />
      )}
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
          <p className="thread-empty-state-copy">No connector activity yet.</p>
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

export function DesktopWorkbenchApp() {
  const [activeSpace, setActiveSpace] = useState<DesktopSpace>("projects");
  const [ariaState, setAriaState] = useState<AriaDesktopAriaShellState>(EMPTY_ARIA_STATE);
  const [pinnedAriaSessionIds, setPinnedAriaSessionIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shellState, setShellState] = useState<AriaDesktopProjectShellState>(EMPTY_SHELL_STATE);

  const selectedProject = getSelectedProject(shellState);
  const selectedThreadState = shellState.selectedThreadState;

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

  useEffect(() => {
    if (!window.ariaDesktop) {
      return;
    }

    return window.ariaDesktop.onProjectShellStateChanged((nextShellState) => {
      startTransition(() => {
        setShellState(nextShellState);
      });
    });
  }, []);

  useEffect(() => {
    if (!window.ariaDesktop) {
      return;
    }

    return window.ariaDesktop.onAriaShellStateChanged((nextAriaState) => {
      startTransition(() => {
        setAriaState(nextAriaState);
      });
    });
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

  function archiveProjectThread(threadId: string): void {
    void applyProjectShellState(() => window.ariaDesktop.archiveProjectThread(threadId));
  }

  function selectProject(projectId: string): void {
    void applyProjectShellState(() => window.ariaDesktop.selectProject(projectId));
  }

  function selectThread(projectId: string, threadId: string): void {
    void applyProjectShellState(() => window.ariaDesktop.selectThread(projectId, threadId));
  }

  function setProjectThreadPinned(threadId: string, pinned: boolean): void {
    void applyProjectShellState(() => window.ariaDesktop.setProjectThreadPinned(threadId, pinned));
  }

  function toggleProject(projectId: string, collapsed: boolean): void {
    void applyProjectShellState(() => window.ariaDesktop.setProjectCollapsed(projectId, collapsed));
  }

  function createAriaChat(): void {
    void applyAriaShellState(() => window.ariaDesktop.createAriaChatSession());
  }

  function archiveAriaChat(sessionId: string): void {
    void applyAriaShellState(() => window.ariaDesktop.archiveAriaChatSession(sessionId));
  }

  function selectAriaChat(sessionId: string): void {
    void applyAriaShellState(() => window.ariaDesktop.selectAriaChatSession(sessionId));
  }

  function togglePinnedAriaSession(sessionId: string): void {
    startTransition(() => {
      setPinnedAriaSessionIds((current) =>
        current.includes(sessionId)
          ? current.filter((entry) => entry !== sessionId)
          : [...current, sessionId],
      );
    });
  }

  function selectAriaScreen(screen: AriaDesktopAriaScreen): void {
    void applyAriaShellState(() => window.ariaDesktop.selectAriaScreen(screen));
  }

  function refreshAutomations(): void {
    void applyAriaShellState(() => window.ariaDesktop.refreshAutomations());
  }

  function selectAutomationTask(taskId: string): void {
    void applyAriaShellState(() => window.ariaDesktop.selectAutomationTask(taskId));
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

  function sendProjectThreadMessage(threadId: string, message: string): void {
    void window.ariaDesktop
      .sendProjectThreadMessage(threadId, message)
      .then((nextShellState) => {
        startTransition(() => {
          setShellState(nextShellState);
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function createProjectThreadBranch(threadId: string, branchName: string): void {
    void window.ariaDesktop
      .createProjectThreadBranch(threadId, branchName)
      .then((nextShellState) => {
        startTransition(() => {
          setShellState(nextShellState);
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function switchProjectThreadEnvironment(threadId: string, environmentId: string): void {
    void window.ariaDesktop
      .switchProjectThreadEnvironment(threadId, environmentId)
      .then((nextShellState) => {
        startTransition(() => {
          setShellState(nextShellState);
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function setProjectThreadModel(threadId: string, modelId: string | null): void {
    void window.ariaDesktop
      .setProjectThreadModel(threadId, modelId)
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
  const activeAriaChatSession =
    ariaState.chatSessions.find(
      (session) => session.sessionId === ariaState.selectedAriaSessionId,
    ) ?? null;
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
      center={
        settingsOpen ? (
          <SettingsView />
        ) : activeSpace === "projects" ? (
          <ThreadView
            onCreateBranch={createProjectThreadBranch}
            onImportProject={importProject}
            onSetModel={setProjectThreadModel}
            onSendMessage={sendProjectThreadMessage}
            onSwitchEnvironment={switchProjectThreadEnvironment}
            selectedProject={selectedProject}
            selectedThreadState={selectedThreadState}
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
            isArchived={Boolean(activeAriaChatSession?.archived)}
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
            onArchiveThread={archiveProjectThread}
            onCreateThread={createThread}
            onOpenSettings={openSettings}
            onSelectProject={selectProject}
            onSelectThread={selectThread}
            onTogglePinnedThread={setProjectThreadPinned}
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
            pinnedSessionIds={pinnedAriaSessionIds}
            onArchiveChatSession={archiveAriaChat}
            onCreateChat={createAriaChat}
            onOpenSettings={openSettings}
            onSearchChatSessions={searchChatSessions}
            onSelectChatSession={selectAriaChat}
            onSelectConnectorScreen={() => selectAriaScreen("connectors")}
            onSelectScreen={selectAriaScreen}
            onTogglePinnedChatSession={togglePinnedAriaSession}
            settingsActive={settingsOpen}
          />
        )
      }
      leftSidebarTitle={<DesktopSpaceTabs activeSpace={activeSpace} onSelectSpace={selectSpace} />}
      leftSidebarToolbarItems={leftSidebarToolbarItems}
      rightSidebar={
        activeSpace === "projects" && selectedThreadState ? (
          <ThreadInspectorSurface thread={selectedThreadState} />
        ) : showAriaChat ? (
          <AriaInspectorSurface chat={ariaState.chat} serverLabel={ariaState.serverLabel} />
        ) : undefined
      }
      rightSidebarTitle={
        activeSpace === "projects" && selectedThreadState
          ? selectedThreadState.title
          : showAriaChat
            ? "Session"
            : undefined
      }
      showMainTopbar={!settingsOpen}
      title={
        activeSpace === "projects"
          ? (selectedThreadState?.title ?? selectedProject?.name ?? "Projects")
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
