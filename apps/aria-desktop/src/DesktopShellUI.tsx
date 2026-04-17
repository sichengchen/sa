import { type ReactElement, useState } from "react";
import {
  AppFrame,
  AppFrameHeader,
  AppFrameWorkbench,
  AppFrameSidebar,
  AppFrameCenter,
  AppFrameRightRail,
  AppFrameFooter,
  Button,
  Badge,
  Card,
  Input,
  Select,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  WorkspaceSection,
  ThreadList,
  type ThreadListItem,
} from "@aria/desktop-ui";
import { ChatInterface } from "./components/ChatInterface";
import { type AriaDesktopAppShellProps, type AriaDesktopAppShellModel } from "./shell.js";

function resolveNavigationEntryForSpace(
  spaceId: string,
): { spaceId: string; label: string; screens: Array<{ id: string; label: string }> } {
  const navigation = [
    { spaceId: "aria", label: "Aria", screens: [{ id: "chat", label: "Chat" }, { id: "inbox", label: "Inbox" }, { id: "automations", label: "Automations" }, { id: "connectors", label: "Connectors" }] },
    { spaceId: "projects", label: "Projects", screens: [{ id: "thread-list", label: "Thread List" }, { id: "thread", label: "Active Thread" }] },
  ];
  return navigation.find((n) => n.spaceId === spaceId) ?? navigation[0];
}

export interface DesktopShellUIProps extends Omit<AriaDesktopAppShellProps, "model"> {
  model: AriaDesktopAppShellModel;
}

export function DesktopShellUI(props: DesktopShellUIProps): ReactElement {
  const { model } = props;
  const [activeSpaceId, setActiveSpaceId] = useState<string>(model.activeSpaceId);
  const [activeContextPanelId, setActiveContextPanelId] = useState<string>(model.activeContextPanelId);

  const activeThreadScreen = model.shell.activeThreadScreen;
  const currentThreadId = activeThreadScreen?.header.threadId;
  const activeSpace = model.application.spaces.find((space) => space.id === activeSpaceId);
  const activePanel = model.application.contextPanels.find((panel) => panel.id === activeContextPanelId);
  const environmentOptions = activeThreadScreen?.environmentSwitcher.availableEnvironments ?? model.shell.environments;

  // Convert projects to workspace sections
  const workspaceThreads: ThreadListItem[] = model.shell.projectSidebar.projects.flatMap((project) =>
    project.threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      status: thread.status,
      threadTypeLabel: thread.threadTypeLabel,
    })),
  );

  return (
    <AppFrame>
      {/* Header */}
      <AppFrameHeader>
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-brand to-brand-dark text-sm font-bold text-white">
            A
          </div>
          <div className="min-w-0">
            <h1 className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--aria-text)]">
              {model.application.displayName}
            </h1>
            <p className="m-0 text-xs text-[var(--aria-text-muted)]">
              {activeThreadScreen
                ? `${activeThreadScreen.header.projectLabel ?? "Projects"} / ${activeThreadScreen.header.title}`
                : "Projects workbench"}
            </p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="default">{activeSpace?.label ?? activeSpaceId}</Badge>
            <Badge variant="default">{activePanel?.label ?? activeContextPanelId}</Badge>
            <Badge variant={model.ariaThread.state.connected ? "success" : "danger"}>
              {model.ariaThread.state.connected ? "Connected" : "Offline"}
            </Badge>
          </div>
          <small className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--aria-text-muted)]">
            Aria thread: {model.ariaThread.state.connected ? model.ariaThread.state.sessionId : "disconnected"} | Model: {model.ariaThread.state.modelName} | Status: {model.ariaThread.state.sessionStatus}
          </small>
        </div>

        {/* Server switcher */}
        <div className="flex min-w-[160px] flex-col gap-1 text-xs uppercase tracking-wider text-[var(--aria-text-muted)]">
          <span>{model.application.frame.serverSwitcher.label}</span>
          <Select
            options={model.shell.serverSwitcher.availableServers.map((server) => ({
              value: server.id,
              label: server.label,
            }))}
            value={model.activeServerId}
            onValueChange={(value) => props.onSwitchServer?.(value)}
            aria-label="Server switcher"
          />
        </div>
      </AppFrameHeader>

      {/* Workbench */}
      <AppFrameWorkbench>
        {/* Sidebar */}
        <AppFrameSidebar>
          <Sidebar>
            <SidebarHeader>
              <Tabs value={activeSpaceId} onValueChange={setActiveSpaceId}>
                <TabList aria-label="Desktop spaces">
                  {model.application.spaces.map((space) => (
                    <Tab key={space.id} value={space.id}>
                      {space.label}
                    </Tab>
                  ))}
                </TabList>
              </Tabs>
            </SidebarHeader>

            <SidebarContent>
              <WorkspaceSection
                label="Projects"
                threads={
                  <ThreadList
                    items={workspaceThreads}
                    activeId={currentThreadId}
                    onItemClick={(id) => props.onSelectProjectThread?.(id)}
                  />
                }
              />
            </SidebarContent>

            <SidebarFooter>
              <Button variant="ghost" size="sm">Settings</Button>
              <Button variant="ghost" size="sm">Theme</Button>
            </SidebarFooter>
          </Sidebar>
        </AppFrameSidebar>

        {/* Center */}
        <AppFrameCenter>
          <Tabs value={model.activeScreenId} onValueChange={(v) => props.onSelectScreen?.(v)}>
            <div className="flex flex-col border-b border-[var(--aria-border)] p-3">
              <div className="mb-2 text-sm font-semibold">
                {activeThreadScreen?.header.title ?? "No active thread"}
              </div>
              <TabList aria-label="Workspace tabs">
                <Tab value="projects-root">Projects</Tab>
                {activeThreadScreen && <Tab value={activeThreadScreen.header.threadId}>{activeThreadScreen.header.title}</Tab>}
              </TabList>
            </div>

            <TabPanel value={model.activeScreenId}>
              <div className="flex flex-col gap-3 p-3">
                {/* Thread info */}
                <Card variant="soft">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
                    {activeThreadScreen?.header.projectLabel ?? "Select a project thread"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="default">{activeThreadScreen?.header.threadTypeLabel ?? "Thread"}</Badge>
                    <Badge variant="default">{activeThreadScreen?.header.statusLabel ?? "Idle"}</Badge>
                    {activeThreadScreen?.header.agentLabel && (
                      <Badge variant="accent">Agent: {activeThreadScreen.header.agentLabel}</Badge>
                    )}
                    <Badge variant="default">{activeThreadScreen?.header.serverLabel ?? model.activeServerLabel}</Badge>
                  </div>
                </Card>

                {/* Environment switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-[var(--aria-text-muted)]">
                    {activeThreadScreen?.environmentSwitcher.label ?? "Environment"}
                  </span>
                  <Select
                    options={environmentOptions.map((env) => ({
                      value: env.id,
                      label: env.label,
                    }))}
                    value={activeThreadScreen?.environmentSwitcher.activeEnvironmentId}
                    onValueChange={(value) => props.onSelectThreadEnvironment?.(value)}
                    aria-label="Environment switcher"
                  />
                </div>

                {/* Message stream */}
                <ChatInterface
                  messages={model.ariaThread.state.messages}
                  streamingText={model.ariaThread.state.streamingText}
                  isStreaming={model.ariaThread.state.isStreaming}
                  pendingApproval={model.ariaThread.state.pendingApproval}
                  pendingQuestion={model.ariaThread.state.pendingQuestion}
                  onApproveToolCall={(toolCallId, approved) => props.onApproveToolCall?.(toolCallId, approved)}
                  onAcceptToolCallForSession={(toolCallId) => props.onAcceptToolCallForSession?.(toolCallId)}
                  onAnswerQuestion={(questionId, answer) => props.onAnswerQuestion?.(questionId, answer)}
                />

                {/* Error */}
                {model.ariaThread.state.lastError && (
                  <Card variant="error">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-danger)]">
                      Connection
                    </div>
                    <p className="m-0 text-xs text-[var(--aria-danger)]">Error: {model.ariaThread.state.lastError}</p>
                  </Card>
                )}
              </div>
            </TabPanel>
          </Tabs>
        </AppFrameCenter>

        {/* Right rail */}
        <AppFrameRightRail>
          <div className="flex h-full flex-col gap-3 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
              Inspector
            </div>

            <Tabs value={activeContextPanelId} onValueChange={setActiveContextPanelId}>
              <TabList aria-label="Inspector panels">
                {model.application.contextPanels.map((panel) => (
                  <Tab key={panel.id} value={panel.id}>
                    {panel.label}
                  </Tab>
                ))}
              </TabList>

              <TabPanel value={activeContextPanelId}>
                <div className="flex flex-col gap-2">
                  <Card variant="soft">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
                      {activePanel?.label ?? "Review"}
                    </div>
                    <strong className="text-sm">{activeThreadScreen?.header.title ?? "No active thread"}</strong>
                    <p className="m-0 text-xs text-[var(--aria-text-muted)]">
                      Pending approval: {model.ariaThread.state.pendingApproval?.toolName ?? "none"}
                    </p>
                    <p className="m-0 text-xs text-[var(--aria-text-muted)]">
                      Pending question: {model.ariaThread.state.pendingQuestion?.question ?? "none"}
                    </p>
                  </Card>
                </div>
              </TabPanel>
            </Tabs>

            {/* Sessions */}
            <Card variant="soft">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--aria-text-muted)]">
                Sessions
              </div>
              <p className="m-0 text-xs text-[var(--aria-text-muted)]">
                Recent Aria sessions: {model.ariaRecentSessions.length}
              </p>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const field = form.elements.namedItem("aria-session-search");
                  if (field instanceof HTMLInputElement) {
                    props.onSearchAriaSessions?.(field.value);
                  }
                }}
              >
                <Input
                  name="aria-session-search"
                  placeholder="Find session"
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Search
                </Button>
              </form>
            </Card>
          </div>
        </AppFrameRightRail>
      </AppFrameWorkbench>

      {/* Footer / Composer */}
      <AppFrameFooter>
        <div className="flex flex-col gap-1.5">
          <Badge variant="default">{activeThreadScreen?.header.environmentLabel ?? "No active environment"}</Badge>
        </div>
        <form
          className="flex min-w-0 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const field = form.elements.namedItem("aria-composer-draft");
            if (field instanceof HTMLTextAreaElement) {
              props.onSendAriaMessage?.(field.value);
            }
          }}
        >
          <textarea
            name="aria-composer-draft"
            className="min-h-[88px] flex-1 resize-y rounded-md border border-[var(--aria-border)] bg-white p-3 text-sm placeholder:text-[var(--aria-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--aria-accent)]"
            placeholder={activeThreadScreen ? `Continue ${activeThreadScreen.header.title}` : "Select a project thread to compose"}
            defaultValue={activeThreadScreen ? `Continue ${activeThreadScreen.header.title}` : "Select a project thread to compose"}
          />
          <div className="flex flex-col gap-2">
            <Button type="submit" variant="primary">
              Send
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                props.onStopAriaSession?.();
              }}
            >
              Stop
            </Button>
          </div>
        </form>
      </AppFrameFooter>
    </AppFrame>
  );
}
