import { describe, expect, test } from "bun:test";
import type {
  AriaChatController,
  AriaChatSessionSummary,
  AriaChatState,
} from "@aria/access-client";
import { DesktopAriaService } from "../apps/aria-desktop/src/main/desktop-aria-service.js";

function createChatState(sessionId: string | null = null): AriaChatState {
  return {
    agentName: "Esperta Aria",
    approvalMode: "ask",
    connected: sessionId !== null,
    isStreaming: false,
    lastError: null,
    messages: [],
    modelName: "sonnet",
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default",
    securityModeRemainingTTL: null,
    sessionId,
    sessionStatus: sessionId ? "resumed" : "disconnected",
    streamingText: "",
  };
}

function createFakeController(options: {
  archived?: AriaChatSessionSummary[];
  currentSessionId?: string;
  live?: AriaChatSessionSummary[];
  onUpdate?: (state: AriaChatState) => void;
}): AriaChatController {
  const archived = options.archived ?? [];
  const live = options.live ?? [];
  let createCount = 0;
  let state = createChatState(options.currentSessionId ?? null);

  const publish = () => {
    options.onUpdate?.(state);
    return state;
  };

  return {
    acceptToolCallForSession: async () => {
      state = { ...state, pendingApproval: null };
      return publish();
    },
    answerQuestion: async (_questionId, answer) => {
      state = {
        ...state,
        messages: [...state.messages, { content: `Answer: ${answer}`, role: "tool" }],
        pendingQuestion: null,
      };
      return publish();
    },
    approveToolCall: async () => {
      state = { ...state, pendingApproval: null };
      return publish();
    },
    connect: async () => {
      state = { ...createChatState(options.currentSessionId ?? "chat-current") };
      return publish();
    },
    createSession: async () => {
      createCount += 1;
      state = { ...createChatState(`chat-created-${createCount}`), sessionStatus: "created" };
      return publish();
    },
    getState: () => state,
    listArchivedSessions: async () => archived,
    listSessions: async () => live,
    openSession: async (sessionId) => {
      state = {
        ...createChatState(sessionId),
        messages: [{ content: `Opened ${sessionId}`, role: "assistant" }],
      };
      return publish();
    },
    searchSessions: async (query) =>
      [...live, ...archived].filter((session) => (session.summary ?? "").includes(query)),
    sendMessage: async (message) => {
      state = {
        ...state,
        connected: true,
        messages: [
          ...state.messages,
          { content: message, role: "user" },
          { content: `Echo ${message}`, role: "assistant" },
        ],
        sessionId: state.sessionId ?? "chat-current",
      };
      return publish();
    },
    stop: async () => {
      state = {
        ...state,
        messages: [...state.messages, { content: "Stopped by user", role: "tool" }],
      };
      return publish();
    },
  };
}

describe("DesktopAriaService", () => {
  test("prefers the connected desktop session over older archived sessions", async () => {
    const live: AriaChatSessionSummary[] = [
      {
        archived: false,
        connectorId: "desktop",
        connectorType: "tui",
        lastActiveAt: 100,
        sessionId: "chat-older",
      },
      {
        archived: false,
        connectorId: "desktop",
        connectorType: "tui",
        lastActiveAt: 200,
        sessionId: "chat-newer",
      },
    ];

    const service = new DesktopAriaService({
      chatControllerFactory: (_target, onUpdate) =>
        createFakeController({
          currentSessionId: "chat-older",
          live,
          onUpdate,
        }),
      client: {
        automation: {
          list: { query: async () => [] },
          runs: { query: async () => [] },
        },
      } as any,
      connectorControllerFactory: (_target, onUpdate) =>
        createFakeController({
          live: [],
          onUpdate,
        }),
      target: { baseUrl: "http://127.0.0.1:7420", serverId: "local", token: "token" },
    });

    const state = await service.getAriaShellState();

    expect(state.selectedAriaSessionId).toBe("chat-older");
    expect(state.selectedAriaScreen).toBeNull();
    expect(state.chat.sessionId).toBe("chat-older");
  });

  test("creates a new chat session and selects it", async () => {
    const service = new DesktopAriaService({
      chatControllerFactory: (_target, onUpdate) =>
        createFakeController({
          currentSessionId: "chat-current",
          live: [],
          onUpdate,
        }),
      client: {
        automation: {
          list: { query: async () => [] },
          runs: { query: async () => [] },
        },
      } as any,
      connectorControllerFactory: (_target, onUpdate) =>
        createFakeController({
          live: [],
          onUpdate,
        }),
      target: { baseUrl: "http://127.0.0.1:7420", serverId: "local", token: "token" },
    });

    const state = await service.createAriaChatSession();

    expect(state.selectedAriaSessionId).toBe("chat-created-1");
    expect(state.chat.sessionId).toBe("chat-created-1");
    expect(state.chat.sessionStatus).toBe("created");
  });

  test("loads automations and connector sessions through desktop-owned selection state", async () => {
    const connectorSessions: AriaChatSessionSummary[] = [
      {
        archived: false,
        connectorId: "telegram:123",
        connectorType: "telegram",
        lastActiveAt: 300,
        sessionId: "connector-1",
        summary: "Telegram thread",
      },
    ];

    const service = new DesktopAriaService({
      chatControllerFactory: (_target, onUpdate) =>
        createFakeController({
          currentSessionId: "chat-current",
          live: [],
          onUpdate,
        }),
      client: {
        automation: {
          list: {
            query: async () => [
              {
                createdAt: 1,
                enabled: true,
                name: "digest",
                paused: false,
                taskId: "task-1",
                taskType: "cron",
                updatedAt: 2,
              },
            ],
          },
          runs: {
            query: async () => [
              {
                attemptNumber: 1,
                deliveryStatus: "not_requested",
                maxAttempts: 1,
                startedAt: 10,
                status: "success",
                taskId: "task-1",
                taskName: "digest",
                taskRunId: "run-1",
                trigger: "cron",
              },
            ],
          },
        },
      } as any,
      connectorControllerFactory: (_target, onUpdate) =>
        createFakeController({
          live: connectorSessions,
          onUpdate,
        }),
      target: { baseUrl: "http://127.0.0.1:7420", serverId: "local", token: "token" },
    });

    const automationState = await service.selectAriaScreen("automations");
    expect(automationState.selectedAriaScreen).toBe("automations");
    expect(automationState.automations.tasks[0]?.name).toBe("digest");
    expect(automationState.automations.runs[0]?.taskRunId).toBe("run-1");

    const connectorState = await service.selectConnectorSession("connector-1");
    expect(connectorState.selectedAriaScreen).toBe("connectors");
    expect(connectorState.connectors.sessionId).toBe("connector-1");
  });
});
