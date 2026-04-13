import { describe, expect, test } from "bun:test";
import {
  createAriaMobileAppShell,
  createAriaMobileNativeHostController,
  createAriaMobileNativeHostBootstrap,
  createAriaMobileNativeHostModel,
  resolveAriaMobileNativeHostTarget,
  startAriaMobileNativeHostBootstrap,
  startAriaMobileNativeHostShell,
  switchAriaMobileNativeHostBootstrapServer,
} from "aria-mobile";

describe("aria-mobile native host scaffold", () => {
  test("derives a native host summary from the mobile app shell", () => {
    const shell = createAriaMobileAppShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadState: {
        connected: true,
        sessionId: "mobile:session-1",
        sessionStatus: "resumed",
        approvalMode: "ask",
        securityMode: "trusted",
        securityModeRemainingTTL: 600,
        modelName: "sonnet",
        agentName: "Esperta Aria",
        messages: [{ role: "assistant", content: "hello" }],
        streamingText: "",
        isStreaming: false,
        pendingApproval: null,
        pendingQuestion: null,
        lastError: null,
      },
    });

    expect(createAriaMobileNativeHostModel(shell)).toEqual({
      title: "Aria Mobile",
      serverLabel: "mobile",
      availableServers: [{ serverId: "mobile", label: "mobile", selected: true }],
      sessionId: "mobile:session-1",
      sessionStatus: "resumed",
      approvalMode: "ask",
      securityMode: "trusted",
      transcriptCount: 1,
      latestMessage: "hello",
      pendingApproval: "none",
      pendingQuestion: "none",
      recentSessions: [],
    });
  });

  test("resolves native host targets and bootstraps", () => {
    expect(resolveAriaMobileNativeHostTarget(undefined)).toEqual({
      serverId: "mobile",
      baseUrl: "http://127.0.0.1:7420/",
      token: undefined,
      directBaseUrl: undefined,
      relayBaseUrl: undefined,
      directReachable: undefined,
      preferredTransportMode: undefined,
    });

    const bootstrap = createAriaMobileNativeHostBootstrap({
      serverId: "relay",
      baseUrl: "https://relay.example.test/",
    });
    expect(bootstrap.target.serverId).toBe("relay");
    expect(bootstrap.model.serverLabel).toBe("relay");
  });

  test("starts a mobile native host shell with recent sessions loaded", async () => {
    const connectedState = {
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "trusted" as const,
      securityModeRemainingTTL: 600,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [{ role: "assistant" as const, content: "hello" }],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const controller = {
      getState: () => connectedState,
      connect: async () => connectedState,
      sendMessage: async () => connectedState,
      stop: async () => connectedState,
      openSession: async () => connectedState,
      approveToolCall: async () => connectedState,
      acceptToolCallForSession: async () => connectedState,
      answerQuestion: async () => connectedState,
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
      searchSessions: async () => [],
    };

    const shell = await startAriaMobileNativeHostShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      ariaThreadController: controller as any,
    });

    expect(createAriaMobileNativeHostModel(shell).recentSessions).toEqual([
      {
        sessionId: "mobile:live-1",
        kind: "live",
        preview: undefined,
        summary: undefined,
        score: undefined,
      },
      {
        sessionId: "mobile:archived-1",
        kind: "archived",
        preview: "Archived",
        summary: "Archived summary",
        score: undefined,
      },
    ]);

    const bootstrap = await startAriaMobileNativeHostBootstrap({
      serverId: "mobile",
      baseUrl: "https://aria.example.test/",
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
      ariaThreadController: controller as any,
    });
    expect(bootstrap.target.serverId).toBe("mobile");
    expect(bootstrap.model.recentSessions).toEqual([
      {
        sessionId: "mobile:live-1",
        kind: "live",
        preview: undefined,
        summary: undefined,
        score: undefined,
      },
      {
        sessionId: "mobile:archived-1",
        kind: "archived",
        preview: "Archived",
        summary: "Archived summary",
        score: undefined,
      },
    ]);
  });

  test("switches a mobile native host bootstrap to another server", async () => {
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

    const bootstrap = await startAriaMobileNativeHostBootstrap({
      serverId: "mobile",
      baseUrl: "https://aria.example.test/",
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
      ariaThreadController: factory({ serverId: "mobile" }) as any,
      createAriaThreadController: factory as any,
    });

    const switched = await switchAriaMobileNativeHostBootstrapServer(bootstrap, "relay");
    expect(switched.target.serverId).toBe("relay");
    expect(switched.shell.activeServerId).toBe("relay");
    expect(switched.model.sessionId).toBe("relay:session-1");
  });

  test("exposes a pure mobile native host controller", async () => {
    let state: any = {
      connected: true,
      sessionId: "mobile:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "trusted" as const,
      securityModeRemainingTTL: 600,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [{ role: "assistant" as const, content: "hello" }],
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
    };
    const controller = createAriaMobileNativeHostController({
      serverId: "mobile",
      baseUrl: "https://aria.example.test/",
      ariaThreadController: {
        getState: () => state,
        connect: async () => state,
        sendMessage: async () => {
          state = {
            ...state,
            messages: [...state.messages, { role: "assistant" as const, content: "sent" }],
          };
          return state;
        },
        stop: async () => {
          state = {
            ...state,
            messages: [
              ...state.messages,
              {
                role: "tool" as const,
                content: "Stopped by user",
                toolName: "system",
              },
            ],
          };
          return state;
        },
        openSession: async () => state,
        approveToolCall: async () => {
          state = { ...state, pendingApproval: null };
          return state;
        },
        acceptToolCallForSession: async () => {
          state = { ...state, pendingApproval: null };
          return state;
        },
        answerQuestion: async () => {
          state = {
            ...state,
            pendingQuestion: null,
            messages: [
              ...state.messages,
              {
                role: "tool" as const,
                content: "Answer: Yes",
                toolName: "ask_user",
              },
            ],
          };
          return state;
        },
        listSessions: async () => [],
        listArchivedSessions: async () => [],
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
      } as any,
    });

    const started = await controller.start();
    expect(started.model.sessionId).toBe("mobile:session-1");
    expect(controller.getBootstrap().model.latestMessage).toBe("hello");

    const sent = await controller.sendMessage("hi");
    expect(sent.model.latestMessage).toBe("sent");

    const stopped = await controller.stop();
    expect(stopped.model.latestMessage).toBe("Stopped by user");

    const approved = await controller.approveToolCall("tool-1", true);
    expect(approved.model.pendingApproval).toBe("none");

    const searched = await controller.searchSessions("archived");
    expect(searched.model.recentSessions).toEqual([
      {
        sessionId: "mobile:search-1",
        kind: "archived",
        preview: "Search preview",
        summary: "Search summary",
        score: undefined,
      },
    ]);

    const answered = await controller.answerQuestion("question-1", "Yes");
    expect(answered.model.pendingQuestion).toBe("none");
    expect(answered.model.latestMessage).toBe("Answer: Yes");
  });
});
