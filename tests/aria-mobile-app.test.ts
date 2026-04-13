import { describe, expect, test } from "bun:test";

import {
  AriaMobileApplicationRoot,
  AriaMobileApplicationShell,
  ariaMobileApplication,
  ariaMobileAppFrame,
  ariaMobileAppModel,
  ariaMobileHost,
  ariaMobileNavigation,
  acceptAriaMobileAppShellToolCallForSession,
  answerAriaMobileAppShellQuestion,
  approveAriaMobileAppShellToolCall,
  connectAriaMobileAppShell,
  createAriaMobileApplicationBootstrap,
  createAriaMobileApplicationShell,
  createAriaMobileApplicationRoot,
  createConnectedAriaMobileAppShell,
  createAriaMobileAppShell,
  createAriaMobileHostBootstrap,
  openAriaMobileAppShellSession,
  sendAriaMobileAppShellMessage,
  stopAriaMobileAppShell,
} from "../apps/aria-mobile/src/index.js";

describe("Aria mobile app surface", () => {
  test("composes a real app-level shell over the mobile client seam", () => {
    const appShell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "mobile",
      projects: [
        {
          project: { name: "Aria" },
          threads: [
            {
              threadId: "thread-2",
              title: "Remote review",
              status: "idle",
              threadType: "remote_project",
              agentId: "codex",
              approvalLabel: "2 approvals pending",
              automationLabel: "Automation queued",
              remoteReviewLabel: "Ready for remote review",
              connectionLabel: "Connected to Home Server",
              reconnectLabel: "Reconnect after sleep",
            },
          ],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-2",
          title: "Remote review",
          status: "idle",
          threadType: "remote_project",
          agentId: "codex",
          approvalLabel: "2 approvals pending",
          automationLabel: "Automation queued",
          remoteReviewLabel: "Ready for remote review",
          connectionLabel: "Connected to Home Server",
          reconnectLabel: "Reconnect after sleep",
        },
      },
      activeThreadContext: {
        thread: {
          threadId: "thread-2",
          threadType: "remote_project",
          approvalLabel: "2 approvals pending",
          automationLabel: "Automation queued",
          remoteReviewLabel: "Ready for remote review",
          connectionLabel: "Connected to Home Server",
          reconnectLabel: "Reconnect after sleep",
        },
        remoteStatusLabel: "Connected to Home Server",
      },
    });

    expect(ariaMobileHost.navigation).toBe(ariaMobileNavigation);
    expect(ariaMobileAppModel.navigation).toBe(ariaMobileNavigation);
    expect(ariaMobileAppModel.serverSwitcher).toEqual(
      expect.objectContaining({
        placement: "header",
        mode: "multi-server",
      }),
    );
    expect(ariaMobileNavigation.tabs).toEqual([
      { id: "aria", label: "Aria" },
      { id: "projects", label: "Projects" },
    ]);
    expect(ariaMobileNavigation.spaces).toEqual([
      {
        id: "aria",
        label: "Aria",
        defaultScreenId: "chat",
        screens: [
          { id: "chat", label: "Chat", kind: "thread" },
          { id: "inbox", label: "Inbox", kind: "feed" },
          { id: "automations", label: "Automations", kind: "feed" },
          { id: "connectors", label: "Connectors", kind: "feed" },
        ],
      },
      {
        id: "projects",
        label: "Projects",
        defaultScreenId: "thread-list",
        screens: [
          { id: "thread-list", label: "Thread List", kind: "list" },
          { id: "thread", label: "Active Thread", kind: "thread" },
        ],
      },
    ]);
    expect(appShell.layout).toEqual({
      threadListScreen: {
        placement: "stacked",
        mode: "project-first",
      },
      activeThreadScreen: {
        headerPlacement: "top",
        streamPlacement: "center",
        composerPlacement: "bottom",
        detailPresentations: ["bottom-sheet", "push-screen", "segmented-detail-view"],
      },
    });
    expect(appShell.initialThread).toMatchObject({
      id: "thread-2",
      projectLabel: "Aria",
      status: "Idle",
      threadType: "remote_project",
    });
    expect(appShell.activeServerId).toBe("mobile");
    expect(appShell.activeServerLabel).toBe("Home Server");
    expect(appShell.ariaThread.state).toMatchObject({
      connected: false,
      sessionId: null,
      sessionStatus: "disconnected",
      modelName: "unknown",
      messages: [],
      isStreaming: false,
    });
    expect(appShell.serverSwitcher.availableServers.map((server) => server.label)).toEqual([
      "Home Server",
      "Relay Mirror",
    ]);
    expect(appShell.activeThreadContext).toMatchObject({
      threadId: "thread-2",
      threadType: "remote_project",
      threadTypeLabel: "Remote Project",
      serverLabel: "Home Server",
      remoteStatusLabel: "Connected to Home Server",
      connectionLabel: "Connected to Home Server",
      approvalLabel: "2 approvals pending",
      automationLabel: "Automation queued",
      remoteReviewLabel: "Ready for remote review",
      reconnectLabel: "Reconnect after sleep",
    });
    expect(
      createAriaMobileHostBootstrap({
        target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
        servers: [
          {
            label: "Home Server",
            target: {
              serverId: "mobile",
              baseUrl: "https://aria.example.test/",
            },
          },
          {
            label: "Relay Mirror",
            target: {
              serverId: "relay",
              baseUrl: "https://relay.example.test/",
            },
          },
        ],
        activeServerId: "mobile",
      }).appShell.navigation,
    ).toBe(ariaMobileNavigation);
  });

  test("declares a thin remote-first React application root over the app shell", () => {
    const target = {
      serverId: "mobile",
      baseUrl: "https://aria.example.test/",
    };
    const applicationBootstrap = createAriaMobileApplicationBootstrap({
      target,
      servers: [
        {
          label: "Home Server",
          target,
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "mobile",
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-9",
          title: "Reconnect review",
          status: "idle",
          threadType: "remote_project",
          agentId: "codex",
        },
      },
    });

    expect(ariaMobileApplication.frame).toBe(ariaMobileAppFrame);
    expect(ariaMobileApplication.startup).toMatchObject({
      defaultTabId: "aria",
      defaultScreenId: "chat",
    });
    expect(ariaMobileApplication.serverSwitcher).toEqual(
      expect.objectContaining({
        placement: "header",
        mode: "multi-server",
      }),
    );
    expect(applicationBootstrap.application).toBe(ariaMobileApplication);
    const shellElement = createAriaMobileApplicationShell({
      target,
      servers: [
        {
          label: "Home Server",
          target,
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "mobile",
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-9",
          title: "Reconnect review",
          status: "idle",
          threadType: "remote_project",
          agentId: "codex",
        },
      },
      activeThreadContext: {
        thread: {
          threadId: "thread-9",
          threadType: "remote_project",
          reconnectLabel: "Reconnect after sleep",
        },
        serverLabel: "Home Server",
        remoteStatusLabel: "Connected to Home Server",
      },
    });
    const shellProps = shellElement.props as Record<string, unknown>;
    expect(shellElement.type).toBe(AriaMobileApplicationShell);
    expect(shellProps.navigation).toBeUndefined();

    const root = createAriaMobileApplicationRoot({
      target,
      servers: [
        {
          label: "Home Server",
          target,
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "mobile",
      activeThreadContext: {
        thread: {
          threadId: "thread-9",
          threadType: "remote_project",
          reconnectLabel: "Reconnect after sleep",
        },
        serverLabel: "Home Server",
        remoteStatusLabel: "Connected to Home Server",
      },
    });
    expect(root.type).toBe(AriaMobileApplicationShell);
    const rootProps = root.props as {
      shell: ReturnType<typeof createAriaMobileAppShell>;
    };
    expect(rootProps.shell.layout.threadListScreen.mode).toBe("project-first");
    expect(rootProps.shell.app.capabilities).toContain("reconnect");

    const rendered = AriaMobileApplicationShell({ shell: rootProps.shell });
    const renderedProps = rendered.props as Record<string, unknown>;
    expect(rendered.type).toBe("div");
    expect(renderedProps["data-remote-first"]).toBe("true");
    expect(renderedProps["data-active-tab-id"]).toBe("projects");
    expect(Array.isArray(renderedProps.children)).toBe(true);
    expect((renderedProps.children as unknown[]).length).toBe(4);
    expect(rootProps.shell.ariaThread.state.connected).toBe(false);
  });

  test("can create a connected mobile app shell asynchronously", async () => {
    const connectedState = {
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "created" as const,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [{ role: "assistant" as const, content: "hello" }],
      streamingText: "",
      isStreaming: false,
      lastError: null,
    };
    const controller = {
      getState: () => connectedState,
      connect: async () => connectedState,
      sendMessage: async () => connectedState,
    };

    const shell = await createConnectedAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });
    expect(shell.ariaThread.state).toMatchObject({
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "created",
      modelName: "sonnet",
    });

    const connectedShell = await connectAriaMobileAppShell(
      createAriaMobileAppShell({
        target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
        ariaThreadController: controller as any,
      }),
    );
    expect(connectedShell.ariaThread.state.connected).toBe(true);
  });

  test("can send an aria thread message through the mobile app shell", async () => {
    const sentState = {
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "created" as const,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [
        { role: "user" as const, content: "hi" },
        { role: "assistant" as const, content: "hello world" },
      ],
      streamingText: "",
      isStreaming: false,
      lastError: null,
    };
    const controller = {
      getState: () => sentState,
      connect: async () => sentState,
      sendMessage: async () => sentState,
    };

    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });
    const updated = await sendAriaMobileAppShellMessage(shell, "hi");
    expect(updated.ariaThread.state.messages.at(-1)).toEqual({
      role: "assistant",
      content: "hello world",
    });

    const rendered = AriaMobileApplicationShell({ shell: updated });
    const serialized = JSON.stringify(rendered.props).replace(/\s+/g, " ");
    expect(serialized).toContain("Latest Aria message:");
    expect(serialized).toContain("hello world");
  });

  test("renders pending aria interactions in the mobile shell", () => {
    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadState: {
        connected: true,
        sessionId: "mobile:session-1",
        sessionStatus: "resumed",
        modelName: "sonnet",
        agentName: "Esperta Aria",
        messages: [],
        streamingText: "",
        isStreaming: false,
        pendingApproval: {
          toolCallId: "tool-1",
          toolName: "exec",
          args: { command: "rm -rf tmp" },
        },
        pendingQuestion: {
          questionId: "question-1",
          question: "Ship it?",
          options: ["Yes", "No"],
        },
        lastError: null,
      },
    });

    const serialized = JSON.stringify(AriaMobileApplicationShell({ shell }).props).replace(
      /\s+/g,
      " ",
    );
    expect(serialized).toContain("Pending approval:");
    expect(serialized).toContain("exec");
    expect(serialized).toContain("Pending question:");
    expect(serialized).toContain("Ship it?");
  });

  test("can stop an aria thread through the mobile app shell", async () => {
    const stoppedState = {
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "resumed" as const,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [
        {
          role: "tool" as const,
          content: "Stopped by user",
          toolName: "system",
        },
      ],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const controller = {
      getState: () => stoppedState,
      connect: async () => stoppedState,
      sendMessage: async () => stoppedState,
      stop: async () => stoppedState,
    };

    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });
    const stopped = await stopAriaMobileAppShell(shell);

    expect(stopped.ariaThread.state.messages.at(-1)).toEqual({
      role: "tool",
      content: "Stopped by user",
      toolName: "system",
    });
  });

  test("can open a specific aria thread through the mobile app shell", async () => {
    const openedState = {
      connected: true,
      sessionId: "mobile:older-session",
      sessionStatus: "resumed" as const,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [{ role: "assistant" as const, content: "Recovered history" }],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const controller = {
      getState: () => openedState,
      connect: async () => openedState,
      sendMessage: async () => openedState,
      stop: async () => openedState,
      openSession: async () => openedState,
    };

    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });
    const opened = await openAriaMobileAppShellSession(shell, "mobile:older-session");

    expect(opened.ariaThread.state.sessionId).toBe("mobile:older-session");
    expect(opened.ariaThread.state.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Recovered history",
    });
  });

  test("can resolve pending aria interactions through mobile shell helpers", async () => {
    const resolvedState = {
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "resumed" as const,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [{ role: "tool" as const, content: "Answer: Yes", toolName: "ask_user" }],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const controller = {
      getState: () => resolvedState,
      connect: async () => resolvedState,
      sendMessage: async () => resolvedState,
      stop: async () => resolvedState,
      openSession: async () => resolvedState,
      approveToolCall: async () => resolvedState,
      acceptToolCallForSession: async () => resolvedState,
      answerQuestion: async () => resolvedState,
    };

    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });

    expect(
      (await approveAriaMobileAppShellToolCall(shell, "tool-1", true)).ariaThread.state
        .pendingApproval,
    ).toBeNull();
    expect(
      (await acceptAriaMobileAppShellToolCallForSession(shell, "tool-1")).ariaThread.state
        .pendingApproval,
    ).toBeNull();
    expect(
      (
        await answerAriaMobileAppShellQuestion(shell, "question-1", "Yes")
      ).ariaThread.state.messages.at(-1),
    ).toEqual({
      role: "tool",
      content: "Answer: Yes",
      toolName: "ask_user",
    });
  });
});
