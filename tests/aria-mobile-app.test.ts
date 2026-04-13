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
  loadAriaMobileAppShellRecentSessions,
  openAriaMobileAppShellSession,
  searchAriaMobileAppShellSessions,
  sendAriaMobileAppShellMessage,
  stopAriaMobileAppShell,
  switchAriaMobileAppShellServer,
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
        approvalMode: "ask",
        securityMode: "default",
        securityModeRemainingTTL: null,
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
    expect(serialized).toContain("Approval mode:");
    expect(serialized).toContain("Security mode:");
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

  test("can load and search recent aria sessions through the mobile shell", async () => {
    const controller = {
      getState: () => ({
        connected: true,
        sessionId: "mobile:session-1",
        sessionStatus: "resumed" as const,
        modelName: "sonnet",
        agentName: "Esperta Aria",
        messages: [],
        streamingText: "",
        isStreaming: false,
        pendingApproval: null,
        pendingQuestion: null,
        lastError: null,
      }),
      connect: async () => null,
      sendMessage: async () => null,
      stop: async () => null,
      openSession: async () => null,
      approveToolCall: async () => null,
      acceptToolCallForSession: async () => null,
      answerQuestion: async () => null,
      listSessions: async () => [
        {
          sessionId: "mobile:live-1",
          connectorType: "tui",
          connectorId: "mobile",
          archived: false,
        },
      ],
      listArchivedSessions: async () => [
        {
          sessionId: "mobile:archived-1",
          connectorType: "tui",
          connectorId: "mobile",
          archived: true,
          preview: "Archived",
          summary: "Archived summary",
        },
      ],
      searchSessions: async () => [
        {
          sessionId: "mobile:search-1",
          connectorType: "tui",
          connectorId: "mobile",
          archived: true,
          preview: "Search preview",
          summary: "Search summary",
        },
      ],
    };

    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });

    const loaded = await loadAriaMobileAppShellRecentSessions(shell);
    expect(loaded.ariaRecentSessions.map((session) => session.sessionId)).toEqual([
      "mobile:live-1",
      "mobile:archived-1",
    ]);

    const searched = await searchAriaMobileAppShellSessions(shell, "archived");
    expect(searched.ariaRecentSessions.map((session) => session.sessionId)).toEqual([
      "mobile:search-1",
    ]);

    const serialized = JSON.stringify(AriaMobileApplicationShell({ shell: loaded }).props).replace(
      /\s+/g,
      " ",
    );
    expect(serialized).toContain("Recent Aria sessions:");
    expect(serialized).toContain("mobile:live-1");
    expect(serialized).toContain("mobile:archived-1");
  });

  test("wires mobile shell callbacks for switching servers and opening sessions", () => {
    const shell = createAriaMobileAppShell({
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
    });

    const rendered = AriaMobileApplicationShell({
      shell: {
        ...shell,
        ariaRecentSessions: [
          {
            sessionId: "mobile:recent-1",
            connectorType: "tui",
            connectorId: "mobile",
            archived: false,
          },
        ],
      },
      onSwitchServer() {},
      onOpenAriaSession() {},
    });

    const findElement = (
      node: unknown,
      predicate: (props: Record<string, unknown>) => boolean,
    ): { props: Record<string, unknown> } | undefined => {
      if (Array.isArray(node)) {
        for (const entry of node) {
          const found = findElement(entry, predicate);
          if (found) return found;
        }
        return undefined;
      }
      if (!node || typeof node !== "object" || !("props" in node)) {
        return undefined;
      }

      const props = (node as { props: Record<string, unknown> }).props;
      if (predicate(props)) {
        return { props };
      }
      return findElement(props.children, predicate);
    };

    const header = (
      (rendered as { props: { children: unknown[] } }).props.children as unknown[]
    )[0] as {
      props: { children: unknown[] };
    };
    const serverSwitcher = header.props.children[3] as {
      props: { children: unknown[] };
    };
    const select = serverSwitcher.props.children[2] as {
      props: Record<string, unknown>;
    };
    expect(typeof select.props.onChange).toBe("function");

    const openButton = findElement(
      rendered,
      (props) => props["data-open-session-id"] === "mobile:recent-1",
    );
    expect(openButton).toBeDefined();
    expect(openButton!.props["data-open-session-id"]).toBe("mobile:recent-1");
    expect(typeof openButton!.props.onClick).toBe("function");
  });

  test("can switch the mobile app shell to another server", async () => {
    const relayState = {
      connected: true,
      sessionId: "relay:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "trusted" as const,
      securityModeRemainingTTL: 600,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const mobileState = {
      ...relayState,
      sessionId: "mobile:session-1",
    };
    const controllers = new Map([
      [
        "mobile",
        {
          state: mobileState,
          recent: [
            {
              sessionId: "mobile:live",
              connectorType: "tui",
              connectorId: "mobile",
              archived: false,
            },
          ],
        },
      ],
      [
        "relay",
        {
          state: relayState,
          recent: [
            {
              sessionId: "relay:live",
              connectorType: "tui",
              connectorId: "relay",
              archived: true,
              preview: "Relay",
              summary: "Relay",
            },
          ],
        },
      ],
    ]);
    const factory = (target: { serverId: string }) => {
      const entry = controllers.get(target.serverId)!;
      return {
        getState: () => entry.state,
        connect: async () => entry.state,
        sendMessage: async () => entry.state,
        stop: async () => entry.state,
        openSession: async () => entry.state,
        approveToolCall: async () => entry.state,
        acceptToolCallForSession: async () => entry.state,
        answerQuestion: async () => entry.state,
        listSessions: async () => entry.recent as any,
        listArchivedSessions: async () => [],
        searchSessions: async () => [],
      };
    };

    const shell = createAriaMobileAppShell({
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
      createAriaThreadController: factory as any,
    });

    const switched = await switchAriaMobileAppShellServer(shell, "relay");
    expect(switched.activeServerId).toBe("relay");
    expect(switched.activeServerLabel).toBe("Relay Mirror");
    expect(switched.ariaThread.state.sessionId).toBe("relay:session-1");
    expect(switched.ariaRecentSessions.map((session) => session.sessionId)).toEqual(["relay:live"]);
  });
});
