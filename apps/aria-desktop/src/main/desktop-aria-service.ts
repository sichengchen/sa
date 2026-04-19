import type { AutomationRunRecord, AutomationTaskRecord } from "@aria/store";
import {
  createAccessClient,
  createTargetAriaChatController,
  type AccessClientTarget,
  type AriaChatController,
  type AriaChatSessionSummary,
  type AriaChatState,
} from "@aria/access-client";
import { createLocalAccessClient } from "@aria/access-client/local";
import { buildLocalAccessClientOptions } from "@aria/access-client/local";
import type {
  AriaDesktopAriaScreen,
  AriaDesktopAriaShellState,
  AriaDesktopAutomationRun,
  AriaDesktopAutomationState,
  AriaDesktopAutomationTask,
  AriaDesktopChatMessage,
  AriaDesktopChatState,
  AriaDesktopSessionSummary,
} from "../shared/api.js";

const CHAT_CONNECTOR_TYPE = "tui";
const CHAT_PREFIX = "desktop";
const CONNECTOR_PREFIX = "desktop-connectors";
const SERVER_LABEL = "Local Server";
const SESSION_LIST_LIMIT = 30;

type DesktopAriaClient = ReturnType<typeof createAccessClient>["client"];

type DesktopAriaServiceOptions = {
  chatControllerFactory?: (
    target: AccessClientTarget,
    onUpdate: (state: AriaChatState) => void,
  ) => AriaChatController;
  client?: DesktopAriaClient;
  connectorControllerFactory?: (
    target: AccessClientTarget,
    onUpdate: (state: AriaChatState) => void,
  ) => AriaChatController;
  target?: AccessClientTarget;
};

function initialChatState(): AriaDesktopChatState {
  return {
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
  };
}

function normalizeChatState(state: AriaChatState): AriaDesktopChatState {
  return {
    agentName: state.agentName,
    approvalMode: state.approvalMode,
    connected: state.connected,
    isStreaming: state.isStreaming,
    lastError: state.lastError,
    messages: state.messages.map((message, index) => ({
      content: message.content,
      id: `${message.role}:${index}:${message.toolName ?? "message"}`,
      role: message.role,
      toolName: message.toolName ?? null,
    })),
    modelName: state.modelName,
    pendingApproval: state.pendingApproval,
    pendingQuestion: state.pendingQuestion,
    securityMode: state.securityMode,
    securityModeRemainingTTL: state.securityModeRemainingTTL,
    sessionId: state.sessionId,
    sessionStatus: state.sessionStatus,
    streamingText: state.streamingText,
  };
}

function appendDesktopMessage(
  state: AriaDesktopChatState,
  message: Omit<AriaDesktopChatMessage, "id">,
): AriaDesktopChatState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        ...message,
        id: `${message.role}:${state.messages.length}:${message.toolName ?? "message"}`,
      },
    ],
  };
}

function summarizeSession(
  session: AriaChatSessionSummary,
  index: number,
): AriaDesktopSessionSummary {
  const labelSource = session.summary ?? session.preview;
  const trimmedLabel = labelSource
    ?.replace(/\s+/g, " ")
    .replace(/Latest assistant:.*/i, "")
    .replace(/\{"type":"thinking".*/i, "")
    .trim();
  const startedMatch = trimmedLabel?.match(/^Started:\s*(.+)$/i);
  const normalizedLabel = startedMatch
    ? (startedMatch[1] ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .join(" ")
    : trimmedLabel;
  const cleanedLabel = normalizedLabel
    ?.replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[^a-z0-9]+/i, "")
    .trim();

  return {
    archived: session.archived,
    connectorId: session.connectorId,
    connectorType: session.connectorType,
    lastActiveAt: session.lastActiveAt ?? null,
    preview: session.preview ?? null,
    sessionId: session.sessionId,
    summary: session.summary ?? null,
    title:
      cleanedLabel && cleanedLabel.length > 0 ? cleanedLabel.slice(0, 28) : `Session ${index + 1}`,
  };
}

function dedupeAndSortSessions(
  sessions: ReadonlyArray<AriaChatSessionSummary>,
): AriaDesktopSessionSummary[] {
  const sessionMap = new Map<string, AriaChatSessionSummary>();
  for (const session of sessions) {
    const existing = sessionMap.get(session.sessionId);
    if (!existing || (session.lastActiveAt ?? 0) >= (existing.lastActiveAt ?? 0)) {
      sessionMap.set(session.sessionId, session);
    }
  }

  return Array.from(sessionMap.values())
    .sort((left, right) => (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0))
    .map((session, index) => summarizeSession(session, index));
}

function isChatSession(session: AriaChatSessionSummary): boolean {
  return session.connectorType === CHAT_CONNECTOR_TYPE;
}

function isConnectorSession(session: AriaChatSessionSummary): boolean {
  return session.connectorType !== CHAT_CONNECTOR_TYPE;
}

function normalizeAutomationTask(task: AutomationTaskRecord): AriaDesktopAutomationTask {
  return {
    createdAt: task.createdAt,
    enabled: task.enabled,
    lastRunAt: task.lastRunAt ?? null,
    lastStatus: task.lastStatus ?? null,
    lastSummary: task.lastSummary ?? null,
    name: task.name,
    nextRunAt: task.nextRunAt ?? null,
    paused: task.paused,
    slug: task.slug ?? null,
    taskId: task.taskId,
    taskType: task.taskType,
    updatedAt: task.updatedAt,
  };
}

function normalizeAutomationRun(run: AutomationRunRecord): AriaDesktopAutomationRun {
  return {
    attemptNumber: run.attemptNumber,
    completedAt: run.completedAt ?? null,
    deliveryError: run.deliveryError ?? null,
    deliveryStatus: run.deliveryStatus,
    errorMessage: run.errorMessage ?? null,
    maxAttempts: run.maxAttempts,
    startedAt: run.startedAt,
    status: run.status,
    summary: run.summary ?? null,
    taskId: run.taskId,
    taskName: run.taskName,
    taskRunId: run.taskRunId,
    trigger: run.trigger,
  };
}

function resolveLocalDesktopTarget(): AccessClientTarget {
  const local = buildLocalAccessClientOptions();
  return {
    baseUrl: local.httpUrl,
    serverId: "local",
    token: local.token,
  };
}

export class DesktopAriaService {
  private readonly chatControllerFactory: NonNullable<
    DesktopAriaServiceOptions["chatControllerFactory"]
  >;
  private readonly connectorControllerFactory: NonNullable<
    DesktopAriaServiceOptions["connectorControllerFactory"]
  >;
  private readonly client: DesktopAriaClient;
  private readonly target: AccessClientTarget;
  private chatController: AriaChatController | null = null;
  private chatSessions: AriaDesktopSessionSummary[] = [];
  private chatState: AriaDesktopChatState = initialChatState();
  private connectorController: AriaChatController | null = null;
  private connectorSessions: AriaDesktopSessionSummary[] = [];
  private connectorsState: AriaDesktopChatState = initialChatState();
  private selectedAriaScreen: AriaDesktopAriaScreen | null = null;
  private selectedAriaSessionId: string | null = null;
  private automationsState: AriaDesktopAutomationState = {
    lastError: null,
    runs: [],
    selectedTaskId: null,
    tasks: [],
  };
  private bootstrapped = false;

  constructor(options: DesktopAriaServiceOptions = {}) {
    this.target = options.target ?? resolveLocalDesktopTarget();
    this.client =
      options.client ??
      (options.target ? createAccessClient(this.target).client : createLocalAccessClient());
    this.chatControllerFactory =
      options.chatControllerFactory ??
      ((target, onUpdate) =>
        createTargetAriaChatController(target, {
          connectorType: CHAT_CONNECTOR_TYPE,
          onUpdate,
          prefix: CHAT_PREFIX,
        }));
    this.connectorControllerFactory =
      options.connectorControllerFactory ??
      ((target, onUpdate) =>
        createTargetAriaChatController(target, {
          connectorType: CHAT_CONNECTOR_TYPE,
          onUpdate,
          prefix: CONNECTOR_PREFIX,
        }));
  }

  private getChatController(): AriaChatController {
    if (!this.chatController) {
      this.chatController = this.chatControllerFactory(this.target, (state) => {
        this.chatState = normalizeChatState(state);
      });
      this.chatState = normalizeChatState(this.chatController.getState());
    }
    return this.chatController;
  }

  private getConnectorController(): AriaChatController {
    if (!this.connectorController) {
      this.connectorController = this.connectorControllerFactory(this.target, (state) => {
        this.connectorsState = normalizeChatState(state);
      });
      this.connectorsState = normalizeChatState(this.connectorController.getState());
    }
    return this.connectorController;
  }

  private snapshot(): AriaDesktopAriaShellState {
    return {
      automations: this.automationsState,
      chat: this.chatState,
      chatSessions: this.chatSessions,
      connectorSessions: this.connectorSessions,
      connectors: this.connectorsState,
      selectedAriaScreen: this.selectedAriaScreen,
      selectedAriaSessionId: this.selectedAriaSessionId,
      serverLabel: SERVER_LABEL,
    };
  }

  private async runChatTurn(
    chatKey: "chat" | "connectors",
    message: string,
    sessionId: string,
  ): Promise<AriaDesktopAriaShellState> {
    const currentState = chatKey === "chat" ? this.chatState : this.connectorsState;
    const setChatState = (nextState: AriaDesktopAriaShellState["chat"]) => {
      if (chatKey === "chat") {
        this.chatState = nextState;
      } else {
        this.connectorsState = nextState;
      }
    };

    setChatState(
      appendDesktopMessage(
        {
          ...currentState,
          isStreaming: true,
          lastError: null,
          streamingText: "",
        },
        {
          content: message,
          role: "user",
          toolName: null,
        },
      ),
    );

    let streamed = "";

    return await new Promise<AriaDesktopAriaShellState>((resolve) => {
      let settled = false;

      const finish = (nextState?: Partial<AriaDesktopAriaShellState["chat"]>) => {
        if (settled) {
          return;
        }
        settled = true;
        const baseState = chatKey === "chat" ? this.chatState : this.connectorsState;
        setChatState({
          ...baseState,
          ...nextState,
        });
        resolve(this.snapshot());
      };

      this.client.chat.stream.subscribe(
        { message, sessionId },
        {
          onData: (event: any) => {
            const baseState = chatKey === "chat" ? this.chatState : this.connectorsState;

            switch (event.type) {
              case "text_delta":
                streamed += event.delta;
                setChatState({
                  ...baseState,
                  streamingText: streamed,
                });
                break;
              case "tool_start":
                setChatState(
                  appendDesktopMessage(baseState, {
                    content: `Calling ${event.name}...`,
                    role: "tool",
                    toolName: event.name,
                  }),
                );
                break;
              case "tool_end":
                setChatState(
                  appendDesktopMessage(baseState, {
                    content: String(event.content).slice(0, 500),
                    role: "tool",
                    toolName: event.name,
                  }),
                );
                break;
              case "tool_approval_request":
                setChatState({
                  ...baseState,
                  pendingApproval: {
                    args: event.args,
                    toolCallId: event.id,
                    toolName: event.name,
                  },
                });
                break;
              case "user_question":
                setChatState({
                  ...baseState,
                  pendingQuestion: {
                    options: event.options,
                    question: event.question,
                    questionId: event.id,
                  },
                });
                break;
              case "reaction":
                setChatState(
                  appendDesktopMessage(baseState, {
                    content: event.emoji,
                    role: "tool",
                    toolName: "reaction",
                  }),
                );
                break;
              case "done":
                if (streamed) {
                  setChatState(
                    appendDesktopMessage(baseState, {
                      content: streamed,
                      role: "assistant",
                      toolName: null,
                    }),
                  );
                }
                finish({ isStreaming: false, streamingText: "" });
                break;
              case "error":
                setChatState(
                  appendDesktopMessage(baseState, {
                    content: event.message,
                    role: "error",
                    toolName: null,
                  }),
                );
                finish({
                  isStreaming: false,
                  lastError: event.message,
                  streamingText: "",
                });
                break;
            }
          },
          onError: (error: unknown) => {
            const messageText = error instanceof Error ? error.message : String(error);
            const baseState = chatKey === "chat" ? this.chatState : this.connectorsState;
            setChatState(
              appendDesktopMessage(baseState, {
                content: messageText,
                role: "error",
                toolName: null,
              }),
            );
            finish({
              isStreaming: false,
              lastError: messageText,
              streamingText: "",
            });
          },
          onComplete: () => {
            const baseState = chatKey === "chat" ? this.chatState : this.connectorsState;
            if (
              streamed &&
              !baseState.messages.some(
                (entry) => entry.role === "assistant" && entry.content === streamed,
              )
            ) {
              setChatState(
                appendDesktopMessage(baseState, {
                  content: streamed,
                  role: "assistant",
                  toolName: null,
                }),
              );
            }
            finish({ isStreaming: false, streamingText: "" });
          },
        },
      );
    });
  }

  private async loadSessionInventory(
    controller: AriaChatController,
    filter: (session: AriaChatSessionSummary) => boolean,
    query?: string,
  ): Promise<AriaDesktopSessionSummary[]> {
    const sessions = query
      ? await controller.searchSessions(query, SESSION_LIST_LIMIT)
      : [
          ...(await controller.listSessions()),
          ...(await controller.listArchivedSessions(SESSION_LIST_LIMIT)),
        ];

    return dedupeAndSortSessions(sessions.filter(filter));
  }

  private async refreshChatSessions(query?: string): Promise<void> {
    this.chatSessions = await this.loadSessionInventory(
      this.getChatController(),
      isChatSession,
      query,
    );
  }

  private async refreshConnectorSessions(query?: string): Promise<void> {
    this.connectorSessions = await this.loadSessionInventory(
      this.getConnectorController(),
      isConnectorSession,
      query,
    );
  }

  private async refreshAutomationRuns(): Promise<void> {
    if (!this.automationsState.selectedTaskId) {
      this.automationsState = { ...this.automationsState, runs: [] };
      return;
    }

    try {
      const runs = await this.client.automation.runs.query({
        limit: SESSION_LIST_LIMIT,
        taskId: this.automationsState.selectedTaskId,
      });
      this.automationsState = {
        ...this.automationsState,
        lastError: null,
        runs: runs.map(normalizeAutomationRun),
      };
    } catch (error) {
      this.automationsState = {
        ...this.automationsState,
        lastError: error instanceof Error ? error.message : String(error),
        runs: [],
      };
    }
  }

  private async refreshAutomationsInternal(): Promise<void> {
    try {
      const tasks = await this.client.automation.list.query({});
      const nextTasks = tasks.map(normalizeAutomationTask);
      const selectedTaskId =
        nextTasks.find((task) => task.taskId === this.automationsState.selectedTaskId)?.taskId ??
        nextTasks[0]?.taskId ??
        null;

      this.automationsState = {
        ...this.automationsState,
        lastError: null,
        selectedTaskId,
        tasks: nextTasks,
      };
      await this.refreshAutomationRuns();
    } catch (error) {
      this.automationsState = {
        ...this.automationsState,
        lastError: error instanceof Error ? error.message : String(error),
        runs: [],
        selectedTaskId: null,
        tasks: [],
      };
    }
  }

  private async ensureBootstrapped(): Promise<void> {
    if (this.bootstrapped) {
      return;
    }

    try {
      const controller = this.getChatController();
      await controller.connect();
      this.chatState = normalizeChatState(controller.getState());
    } catch (error) {
      this.chatState = {
        ...this.chatState,
        lastError: error instanceof Error ? error.message : String(error),
      };
    }

    await Promise.all([
      this.refreshChatSessions(),
      this.refreshConnectorSessions(),
      this.refreshAutomationsInternal(),
    ]);

    const defaultSessionId = this.chatState.sessionId ?? this.chatSessions[0]?.sessionId;
    if (defaultSessionId) {
      this.selectedAriaSessionId = defaultSessionId;
      this.selectedAriaScreen = null;
      if (this.chatState.sessionId !== defaultSessionId) {
        await this.getChatController().openSession(defaultSessionId);
        this.chatState = normalizeChatState(this.getChatController().getState());
      }
    } else {
      this.selectedAriaScreen = "automations";
      this.selectedAriaSessionId = null;
    }

    this.bootstrapped = true;
  }

  async getAriaShellState(): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    return this.snapshot();
  }

  async createAriaChatSession(): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    const controller = this.getChatController();
    if (controller.createSession) {
      await controller.createSession();
    } else {
      await controller.connect();
    }
    this.chatState = normalizeChatState(controller.getState());
    this.selectedAriaScreen = null;
    this.selectedAriaSessionId = this.chatState.sessionId;
    await this.refreshChatSessions();
    return this.snapshot();
  }

  async selectAriaChatSession(sessionId: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getChatController().openSession(sessionId);
    this.chatState = normalizeChatState(this.getChatController().getState());
    this.selectedAriaScreen = null;
    this.selectedAriaSessionId = sessionId;
    return this.snapshot();
  }

  async selectAriaScreen(screen: AriaDesktopAriaScreen): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    this.selectedAriaScreen = screen;
    this.selectedAriaSessionId = null;

    if (screen === "automations") {
      await this.refreshAutomationsInternal();
    } else if (screen === "connectors") {
      await this.refreshConnectorSessions();
    }

    return this.snapshot();
  }

  async searchAriaChatSessions(query: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.refreshChatSessions(query.trim() || undefined);
    return this.snapshot();
  }

  async sendAriaChatMessage(message: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    if (!this.chatState.sessionId) {
      await this.createAriaChatSession();
    }
    this.selectedAriaScreen = null;
    this.selectedAriaSessionId = this.chatState.sessionId;
    const snapshot = await this.runChatTurn("chat", message, this.chatState.sessionId!);
    await this.refreshChatSessions();
    return snapshot;
  }

  async stopAriaChatSession(): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getChatController().stop();
    this.chatState = normalizeChatState(this.getChatController().getState());
    return this.snapshot();
  }

  async approveAriaChatToolCall(
    toolCallId: string,
    approved: boolean,
  ): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getChatController().approveToolCall(toolCallId, approved);
    this.chatState = normalizeChatState(this.getChatController().getState());
    return this.snapshot();
  }

  async acceptAriaChatToolCallForSession(toolCallId: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getChatController().acceptToolCallForSession(toolCallId);
    this.chatState = normalizeChatState(this.getChatController().getState());
    return this.snapshot();
  }

  async answerAriaChatQuestion(
    questionId: string,
    answer: string,
  ): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getChatController().answerQuestion(questionId, answer);
    this.chatState = normalizeChatState(this.getChatController().getState());
    return this.snapshot();
  }

  async refreshAutomations(): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.refreshAutomationsInternal();
    return this.snapshot();
  }

  async selectAutomationTask(taskId: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    this.selectedAriaScreen = "automations";
    this.selectedAriaSessionId = null;
    this.automationsState = {
      ...this.automationsState,
      selectedTaskId: taskId,
    };
    await this.refreshAutomationRuns();
    return this.snapshot();
  }

  async searchConnectorSessions(query: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    this.selectedAriaScreen = "connectors";
    this.selectedAriaSessionId = null;
    await this.refreshConnectorSessions(query.trim() || undefined);
    return this.snapshot();
  }

  async selectConnectorSession(sessionId: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getConnectorController().openSession(sessionId);
    this.connectorsState = normalizeChatState(this.getConnectorController().getState());
    this.selectedAriaScreen = "connectors";
    this.selectedAriaSessionId = null;
    return this.snapshot();
  }

  async sendConnectorMessage(message: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    if (!this.connectorsState.sessionId) {
      return this.snapshot();
    }
    this.selectedAriaScreen = "connectors";
    const snapshot = await this.runChatTurn("connectors", message, this.connectorsState.sessionId);
    await this.refreshConnectorSessions();
    return snapshot;
  }

  async stopConnectorSession(): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getConnectorController().stop();
    this.connectorsState = normalizeChatState(this.getConnectorController().getState());
    return this.snapshot();
  }

  async approveConnectorToolCall(
    toolCallId: string,
    approved: boolean,
  ): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getConnectorController().approveToolCall(toolCallId, approved);
    this.connectorsState = normalizeChatState(this.getConnectorController().getState());
    return this.snapshot();
  }

  async acceptConnectorToolCallForSession(toolCallId: string): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getConnectorController().acceptToolCallForSession(toolCallId);
    this.connectorsState = normalizeChatState(this.getConnectorController().getState());
    return this.snapshot();
  }

  async answerConnectorQuestion(
    questionId: string,
    answer: string,
  ): Promise<AriaDesktopAriaShellState> {
    await this.ensureBootstrapped();
    await this.getConnectorController().answerQuestion(questionId, answer);
    this.connectorsState = normalizeChatState(this.getConnectorController().getState());
    return this.snapshot();
  }
}
