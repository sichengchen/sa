import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, test } from "bun:test";

import {
  AriaDesktopAppShell,
  AriaDesktopApplicationRoot,
  ariaDesktopApplication,
  ariaDesktopHost,
  acceptAriaDesktopAppShellToolCallForSession,
  answerAriaDesktopAppShellQuestion,
  approveAriaDesktopAppShellToolCall,
  createConnectedAriaDesktopAppShell,
  createConnectedAriaDesktopAppShellModel,
  createAriaDesktopAppShell,
  createAriaDesktopAppShellModel,
  createAriaDesktopApplicationRoot,
  createAriaDesktopApplicationBootstrap,
  loadAriaDesktopAppShellRecentSessions,
  openAriaDesktopAppShellSession,
  searchAriaDesktopAppShellSessions,
  sendAriaDesktopAppShellMessage,
  stopAriaDesktopAppShell,
  switchAriaDesktopAppShellServer,
  type AriaDesktopAppShellModel,
} from "../apps/aria-desktop/src/index.js";

function collectTextContent(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectTextContent(entry));
  }
  if (isValidElement(node)) {
    return collectTextContent((node.props as { children?: ReactNode }).children as ReactNode);
  }
  return [];
}

function childElements(element: { props: { children?: ReactNode } }) {
  return Children.toArray(element.props.children).filter(isValidElement) as Array<{
    props: { children?: ReactNode; [key: string]: unknown };
  }>;
}

function asElementWithProps(element: unknown): {
  props: { children?: ReactNode; [key: string]: unknown };
} {
  return element as unknown as {
    props: { children?: ReactNode; [key: string]: unknown };
  };
}

describe("aria-desktop app assembly", () => {
  test("assembles the desktop app as a product-shaped surface", () => {
    expect(ariaDesktopApplication).toMatchObject({
      id: "aria-desktop",
      packageName: "aria-desktop",
      displayName: "Aria Desktop",
      surface: "desktop",
      shellPackage: "@aria/desktop",
      startup: {
        defaultSpaceId: "projects",
        defaultScreenId: "thread-list",
        defaultContextPanelId: "review",
      },
    });
    expect(ariaDesktopApplication.host).toBe(ariaDesktopHost);
    expect(ariaDesktopApplication.frame).toMatchObject({
      kind: "three-pane-workbench",
      sidebar: {
        label: "Projects",
        mode: "unified-project-thread-tree",
      },
      center: {
        defaultSpaceId: "projects",
        defaultScreenId: "thread-list",
        activeScreenId: "thread",
        threadListMode: "unified-project-thread-list",
      },
      rightRail: {
        defaultContextPanelId: "review",
      },
      composer: {
        placement: "bottom-docked",
        scope: "active-thread",
      },
    });
    expect(ariaDesktopApplication.launchModes.map((mode) => mode.id)).toEqual([
      "server-connected",
      "local-project",
    ]);
    expect(ariaDesktopApplication.sharedPackages).toContain("@aria/desktop-bridge");
    expect(ariaDesktopApplication.capabilities).toContain("local-bridge");
  });

  test("creates app bootstraps with the same host and shell assembly", () => {
    const bootstrap = createAriaDesktopApplicationBootstrap({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "desktop",
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
    });

    expect(bootstrap.application).toBe(ariaDesktopApplication);
    expect(bootstrap.host).toBe(ariaDesktopHost);
    expect(bootstrap.shell.sharedPackages).toContain("@aria/ui");
    expect(bootstrap.bootstrap.servers.map((server) => server.label)).toEqual([
      "Home Server",
      "Relay Mirror",
    ]);
    expect(bootstrap.bootstrap.activeServerId).toBe("desktop");
    expect(bootstrap.bootstrap.activeServerLabel).toBe("Home Server");
    expect(bootstrap.bootstrap.access).toMatchObject({
      serverId: "desktop",
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7420",
    });
    expect(bootstrap.bootstrap.initialThread).toMatchObject({
      id: "thread-1",
      projectLabel: "Aria",
      threadType: "local_project",
    });
  });

  test("builds a React shell view-model from application/bootstrap assembly", () => {
    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "desktop",
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
      environments: [
        {
          hostLabel: "This Device",
          environmentLabel: "wt/main",
          mode: "local",
          target: {
            serverId: "desktop-local",
            baseUrl: "http://127.0.0.1:8123/",
          },
        },
      ],
      activeSpaceId: "projects",
      activeContextPanelId: "environment",
    });

    expect(model.application).toBe(ariaDesktopApplication);
    expect(model.bootstrap.application).toBe(ariaDesktopApplication);
    expect(model.bootstrap.host).toBe(ariaDesktopHost);
    expect(model.activeServerId).toBe("desktop");
    expect(model.activeServerLabel).toBe("Home Server");
    expect(model.activeSpaceId).toBe("projects");
    expect(model.activeContextPanelId).toBe("environment");
    expect(model.ariaThread.state).toMatchObject({
      connected: false,
      sessionId: null,
      sessionStatus: "disconnected",
      modelName: "unknown",
      messages: [],
      isStreaming: false,
    });
    expect(model.shell.projectSidebar.projects[0]).toMatchObject({
      projectLabel: "Aria",
      threads: [
        {
          id: "thread-1",
          threadType: "local_project",
        },
      ],
    });
    expect(model.shell.activeThreadScreen?.environmentSwitcher.availableEnvironments).toEqual([
      expect.objectContaining({
        label: "This Device / wt/main",
        mode: "local",
      }),
    ]);
    expect(model.shell.serverSwitcher.availableServers.map((server) => server.label)).toEqual([
      "Home Server",
      "Relay Mirror",
    ]);
  });

  test("exposes React app-shell component and factory element", () => {
    const built = createAriaDesktopAppShell({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "desktop",
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
      environments: [
        {
          hostLabel: "Home Server",
          environmentLabel: "main",
          mode: "remote",
          target: { serverId: "home", baseUrl: "https://aria.example.test/" },
        },
      ],
    });

    expect(isValidElement(built.element)).toBeTrue();
    expect(built.element.type).toBe(AriaDesktopAppShell);
    const builtElement = asElementWithProps(built.element);
    expect(builtElement.props.model).toBe(built.model);
    expect(built.model.activeServerLabel).toBe("Home Server");

    const rendered = AriaDesktopAppShell({ model: built.model });
    const [topChrome, workbench, statusStrip] = childElements(asElementWithProps(rendered));
    expect(topChrome.props["data-slot"]).toBe("top-chrome");
    expect(workbench.props["data-slot"]).toBe("workbench");
    expect(statusStrip.props["data-slot"]).toBe("status-strip");

    const [sidebar, center, rail] = childElements(workbench);
    expect(sidebar.props["data-slot"]).toBe("sidebar");
    expect(center.props["data-slot"]).toBe("center");
    expect(rail.props["data-slot"]).toBe("right-rail");

    const text = collectTextContent(rendered).join(" ");

    expect(text).toContain("Aria Desktop");
    expect(text).toContain("Home Server");
    expect(text).toContain("Relay Mirror");
    expect(text).toContain("Projects");
    expect(text).toContain("Desktop thread");
    expect(text).toContain("Environment");
    expect(text).toContain("messages + runs");
    expect(text).toContain("Context Panels");
    expect(text).toContain("Home Server / main");
    expect(text.replace(/\s+/g, " ")).toContain("Aria thread: disconnected");
    expect(text.replace(/\s+/g, " ")).toContain("Status: disconnected");
    expect(text.replace(/\s+/g, " ")).toContain("Aria chat messages: 0");
    expect(text.replace(/\s+/g, " ")).toContain("Placement: bottom-docked");
  });

  test("exposes a desktop application root over the app shell", () => {
    const root = createAriaDesktopApplicationRoot({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
    });

    expect(root.type).toBe(AriaDesktopAppShell);
    const rootProps = asElementWithProps(root);
    const model = rootProps.props.model as AriaDesktopAppShellModel;
    expect(model.application).toBe(ariaDesktopApplication);
    expect(model.shell.projectSidebar.label).toBe("Projects");
    expect(model.ariaThread.state.connected).toBe(false);

    const manualRoot = AriaDesktopApplicationRoot({
      model,
    });
    expect(manualRoot.type).toBe(AriaDesktopAppShell);
    const rendered = AriaDesktopAppShell({ model });
    const renderedProps = asElementWithProps(rendered);
    expect(renderedProps.props["data-app-shell"]).toBe("aria-desktop");
  });

  test("can create a connected desktop app shell asynchronously", async () => {
    const connectedState = {
      connected: true,
      sessionId: "desktop:session-1",
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

    const model = await createConnectedAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });
    expect(model.ariaThread.state).toMatchObject({
      connected: true,
      sessionId: "desktop:session-1",
      sessionStatus: "created",
      modelName: "sonnet",
    });

    const built = await createConnectedAriaDesktopAppShell({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });
    expect(built.element.type).toBe(AriaDesktopAppShell);
    expect(built.model.ariaThread.state.connected).toBe(true);
  });

  test("can send an aria thread message through the desktop app shell model", async () => {
    const sentState = {
      connected: true,
      sessionId: "desktop:session-1",
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

    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });

    const updated = await sendAriaDesktopAppShellMessage(model, "hi");
    expect(updated.ariaThread.state.messages.at(-1)).toEqual({
      role: "assistant",
      content: "hello world",
    });

    const rendered = AriaDesktopAppShell({ model: updated });
    const text = collectTextContent(rendered).join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Latest Aria message: hello world");
  });

  test("renders pending aria interactions in the desktop shell", () => {
    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadState: {
        connected: true,
        sessionId: "desktop:session-1",
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

    const text = collectTextContent(AriaDesktopAppShell({ model })).join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Pending approval: exec");
    expect(text).toContain("Pending question: Ship it?");
    expect(text).toContain("Approval mode: ask");
    expect(text).toContain("Security mode: default");
  });

  test("can stop an aria thread through the desktop shell model", async () => {
    const stoppedState = {
      connected: true,
      sessionId: "desktop:session-1",
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

    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });
    const stopped = await stopAriaDesktopAppShell(model);

    expect(stopped.ariaThread.state.messages.at(-1)).toEqual({
      role: "tool",
      content: "Stopped by user",
      toolName: "system",
    });
  });

  test("can open a specific aria thread through the desktop shell model", async () => {
    const openedState = {
      connected: true,
      sessionId: "desktop:older-session",
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

    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });
    const opened = await openAriaDesktopAppShellSession(model, "desktop:older-session");

    expect(opened.ariaThread.state.sessionId).toBe("desktop:older-session");
    expect(opened.ariaThread.state.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Recovered history",
    });
  });

  test("can resolve pending aria interactions through desktop shell helpers", async () => {
    const resolvedState = {
      connected: true,
      sessionId: "desktop:session-1",
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

    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });

    expect(
      (await approveAriaDesktopAppShellToolCall(model, "tool-1", true)).ariaThread.state
        .pendingApproval,
    ).toBeNull();
    expect(
      (await acceptAriaDesktopAppShellToolCallForSession(model, "tool-1")).ariaThread.state
        .pendingApproval,
    ).toBeNull();
    expect(
      (
        await answerAriaDesktopAppShellQuestion(model, "question-1", "Yes")
      ).ariaThread.state.messages.at(-1),
    ).toEqual({
      role: "tool",
      content: "Answer: Yes",
      toolName: "ask_user",
    });
  });

  test("can load and search recent aria sessions through the desktop shell model", async () => {
    const controller = {
      getState: () => ({
        connected: true,
        sessionId: "desktop:session-1",
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
          sessionId: "desktop:live-1",
          connectorType: "tui",
          connectorId: "desktop",
          archived: false,
        },
      ],
      listArchivedSessions: async () => [
        {
          sessionId: "desktop:archived-1",
          connectorType: "tui",
          connectorId: "desktop",
          archived: true,
          preview: "Archived",
          summary: "Archived summary",
        },
      ],
      searchSessions: async () => [
        {
          sessionId: "desktop:search-1",
          connectorType: "tui",
          connectorId: "desktop",
          archived: true,
          preview: "Search preview",
          summary: "Search summary",
        },
      ],
    };

    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });

    const loaded = await loadAriaDesktopAppShellRecentSessions(model);
    expect(loaded.ariaRecentSessions.map((session) => session.sessionId)).toEqual([
      "desktop:live-1",
      "desktop:archived-1",
    ]);

    const searched = await searchAriaDesktopAppShellSessions(model, "archived");
    expect(searched.ariaRecentSessions.map((session) => session.sessionId)).toEqual([
      "desktop:search-1",
    ]);

    const text = collectTextContent(AriaDesktopAppShell({ model: loaded }))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(text).toContain("Recent Aria sessions: 2");
    expect(text).toContain("desktop:live-1 - live");
    expect(text).toContain("desktop:archived-1 - archived");
  });

  test("wires desktop shell callbacks for switching servers and opening sessions", () => {
    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "desktop",
    });
    const shell = AriaDesktopAppShell({
      model: {
        ...model,
        ariaRecentSessions: [
          {
            sessionId: "desktop:recent-1",
            connectorType: "tui",
            connectorId: "desktop",
            archived: false,
          },
        ],
      },
      onSwitchServer() {},
      onOpenAriaSession() {},
    });

    const root = asElementWithProps(shell);
    const findElement = (
      node: ReactNode,
      predicate: (props: Record<string, unknown>) => boolean,
    ): { props: Record<string, unknown> } | undefined => {
      if (Array.isArray(node)) {
        for (const entry of node) {
          const found = findElement(entry, predicate);
          if (found) return found;
        }
        return undefined;
      }
      if (!isValidElement(node)) {
        return undefined;
      }

      const props = node.props as Record<string, unknown>;
      if (predicate(props)) {
        return { props };
      }
      return findElement(props.children as ReactNode, predicate);
    };
    const topChrome = childElements(root)[0]!;
    const serverLabel = childElements(topChrome).find(
      (element) => element.props["data-slot"] === "server-switcher",
    )!;
    const select = childElements(serverLabel)[0]!;
    expect(typeof select.props.onChange).toBe("function");

    const openButton = findElement(
      shell,
      (props) => props["data-session-id"] === "desktop:recent-1",
    );
    expect(openButton?.props.children).toBe("Open");
    expect(typeof openButton?.props.onClick).toBe("function");
  });

  test("can switch the desktop app shell to another server", async () => {
    const relayState = {
      connected: true,
      sessionId: "relay:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "default" as const,
      securityModeRemainingTTL: null,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const desktopState = {
      ...relayState,
      sessionId: "desktop:session-1",
    };
    const controllers = new Map([
      [
        "desktop",
        {
          state: desktopState,
          recent: [
            {
              sessionId: "desktop:live",
              connectorType: "tui",
              connectorId: "desktop",
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

    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "desktop",
      createAriaThreadController: factory as any,
    });

    const switched = await switchAriaDesktopAppShellServer(model, "relay");
    expect(switched.activeServerId).toBe("relay");
    expect(switched.activeServerLabel).toBe("Relay Mirror");
    expect(switched.ariaThread.state.sessionId).toBe("relay:session-1");
    expect(switched.ariaRecentSessions.map((session) => session.sessionId)).toEqual(["relay:live"]);
  });
});
