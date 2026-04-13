import { createAccessClient, type AccessClientTarget } from "./transport.js";

export type AriaChatMessageRole = "user" | "assistant" | "tool" | "error";

export interface AriaChatMessage {
  role: AriaChatMessageRole;
  content: string;
  toolName?: string;
}

export interface AriaChatPendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface AriaChatPendingQuestion {
  questionId: string;
  question: string;
  options?: string[];
}

export interface AriaChatSessionSummary {
  sessionId: string;
  connectorType: string;
  connectorId: string;
  archived: boolean;
  lastActiveAt?: number;
  preview?: string;
  summary?: string;
  score?: number;
}

export interface AriaChatState {
  connected: boolean;
  sessionId: string | null;
  sessionStatus: "disconnected" | "created" | "resumed";
  modelName: string;
  agentName: string;
  messages: AriaChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  pendingApproval: AriaChatPendingApproval | null;
  pendingQuestion: AriaChatPendingQuestion | null;
  lastError: string | null;
}

export interface AriaChatClient {
  health: {
    ping: {
      query(): Promise<{ model: string; agentName: string }>;
    };
  };
  session: {
    getLatest?: {
      query(input: { prefix: string }): Promise<{ id: string } | null>;
    };
    create: {
      mutate(input: {
        connectorType: string;
        prefix: string;
      }): Promise<{ session: { id: string } }>;
    };
    list?: {
      query(): Promise<
        Array<{
          id: string;
          connectorType: string;
          connectorId: string;
          lastActiveAt?: number;
        }>
      >;
    };
    listArchived?: {
      query(input?: { limit?: number }): Promise<
        Array<{
          sessionId: string;
          connectorType: string;
          connectorId: string;
          lastActiveAt: number;
          preview: string;
          summary: string;
        }>
      >;
    };
    search?: {
      query(input: { query: string; limit?: number }): Promise<
        Array<{
          sessionId: string;
          connectorType: string;
          connectorId: string;
          lastActiveAt: number;
          preview: string;
          summary: string;
          score: number;
        }>
      >;
    };
  };
  chat: {
    history?: {
      query(input: { sessionId: string }): Promise<{ messages: unknown[]; archived: boolean }>;
    };
    stream: {
      subscribe(
        input: { sessionId: string; message: string },
        handlers: {
          onData(event: any): void;
          onError(error: unknown): void;
          onComplete(): void;
        },
      ): { unsubscribe(): void } | void;
    };
  };
  tool?: {
    approve?: {
      mutate(input: { toolCallId: string; approved: boolean }): Promise<unknown>;
    };
    acceptForSession?: {
      mutate(input: { toolCallId: string }): Promise<unknown>;
    };
  };
  question?: {
    answer?: {
      mutate(input: { id: string; answer: string }): Promise<unknown>;
    };
  };
}

export interface AriaChatControllerOptions {
  connectorType: string;
  prefix: string;
  onUpdate?(state: AriaChatState): void;
}

export interface AriaChatController {
  getState(): AriaChatState;
  connect(): Promise<AriaChatState>;
  sendMessage(message: string): Promise<AriaChatState>;
  listSessions(): Promise<AriaChatSessionSummary[]>;
  listArchivedSessions(limit?: number): Promise<AriaChatSessionSummary[]>;
  searchSessions(query: string, limit?: number): Promise<AriaChatSessionSummary[]>;
  openSession(sessionId: string): Promise<AriaChatState>;
  approveToolCall(toolCallId: string, approved: boolean): Promise<AriaChatState>;
  acceptToolCallForSession(toolCallId: string): Promise<AriaChatState>;
  answerQuestion(questionId: string, answer: string): Promise<AriaChatState>;
}

function initialState(): AriaChatState {
  return {
    connected: false,
    sessionId: null,
    sessionStatus: "disconnected",
    modelName: "unknown",
    agentName: "Esperta Aria",
    messages: [],
    streamingText: "",
    isStreaming: false,
    pendingApproval: null,
    pendingQuestion: null,
    lastError: null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }

  return "";
}

function normalizeHistoryMessages(messages: unknown[]): AriaChatMessage[] {
  return messages.flatMap((message) => {
    const record = message as {
      role?: string;
      content?: unknown;
      toolName?: string;
    };
    const content = extractMessageContent(record.content).trim();
    if (!content) return [];

    const role: AriaChatMessageRole =
      record.role === "user" || record.role === "assistant" || record.role === "tool"
        ? record.role
        : "error";

    return [{ role, content, toolName: record.toolName }];
  });
}

function normalizeLiveSession(entry: {
  id: string;
  connectorType: string;
  connectorId: string;
  lastActiveAt?: number;
}): AriaChatSessionSummary {
  return {
    sessionId: entry.id,
    connectorType: entry.connectorType,
    connectorId: entry.connectorId,
    archived: false,
    lastActiveAt: entry.lastActiveAt,
  };
}

function normalizeArchivedSession(entry: {
  sessionId: string;
  connectorType: string;
  connectorId: string;
  lastActiveAt: number;
  preview: string;
  summary: string;
  score?: number;
}): AriaChatSessionSummary {
  return {
    sessionId: entry.sessionId,
    connectorType: entry.connectorType,
    connectorId: entry.connectorId,
    archived: true,
    lastActiveAt: entry.lastActiveAt,
    preview: entry.preview,
    summary: entry.summary,
    score: entry.score,
  };
}

export function createAriaChatController(
  client: AriaChatClient,
  options: AriaChatControllerOptions,
): AriaChatController {
  let state = initialState();

  const publish = () => {
    options.onUpdate?.(state);
    return state;
  };

  const setState = (patch: Partial<AriaChatState>) => {
    state = { ...state, ...patch };
    return publish();
  };

  const appendMessage = (message: AriaChatMessage) => {
    state = { ...state, messages: [...state.messages, message] };
    return publish();
  };

  return {
    getState() {
      return state;
    },
    async connect() {
      try {
        const ping = await client.health.ping.query();
        const latest = client.session.getLatest
          ? await client.session.getLatest.query({ prefix: options.prefix })
          : null;
        const sessionId = latest?.id
          ? latest.id
          : (
              await client.session.create.mutate({
                connectorType: options.connectorType,
                prefix: options.prefix,
              })
            ).session.id;

        const hydratedMessages =
          latest?.id && client.chat.history
            ? normalizeHistoryMessages((await client.chat.history.query({ sessionId })).messages)
            : [];

        return setState({
          connected: true,
          modelName: ping.model,
          agentName: ping.agentName,
          sessionId,
          sessionStatus: latest?.id ? "resumed" : "created",
          messages: hydratedMessages,
          lastError: null,
        });
      } catch (error) {
        appendMessage({
          role: "error",
          content: `Failed to connect to Aria Server: ${errorMessage(error)}`,
        });
        return setState({
          connected: false,
          sessionStatus: "disconnected",
          lastError: errorMessage(error),
        });
      }
    },
    async sendMessage(message: string) {
      if (!state.sessionId) {
        throw new Error("Aria chat session is not connected");
      }

      appendMessage({ role: "user", content: message });
      setState({ isStreaming: true, streamingText: "", lastError: null });

      let streamed = "";

      return await new Promise<AriaChatState>((resolve) => {
        let settled = false;
        const finish = (nextState?: Partial<AriaChatState>) => {
          if (settled) return;
          settled = true;
          resolve(setState(nextState ?? {}));
        };

        client.chat.stream.subscribe(
          { sessionId: state.sessionId!, message },
          {
            onData(event) {
              switch (event.type) {
                case "text_delta":
                  streamed += event.delta;
                  setState({ streamingText: streamed });
                  break;
                case "tool_start":
                  appendMessage({
                    role: "tool",
                    content: `Calling ${event.name}...`,
                    toolName: event.name,
                  });
                  break;
                case "tool_end":
                  appendMessage({
                    role: "tool",
                    content: String(event.content).slice(0, 500),
                    toolName: event.name,
                  });
                  break;
                case "tool_approval_request":
                  setState({
                    pendingApproval: {
                      toolCallId: event.id,
                      toolName: event.name,
                      args: event.args,
                    },
                  });
                  break;
                case "user_question":
                  setState({
                    pendingQuestion: {
                      questionId: event.id,
                      question: event.question,
                      options: event.options,
                    },
                  });
                  break;
                case "reaction":
                  appendMessage({
                    role: "tool",
                    content: event.emoji,
                    toolName: "reaction",
                  });
                  break;
                case "done":
                  if (streamed) {
                    appendMessage({ role: "assistant", content: streamed });
                  }
                  finish({ isStreaming: false, streamingText: "" });
                  break;
                case "error":
                  appendMessage({ role: "error", content: event.message });
                  finish({
                    isStreaming: false,
                    streamingText: "",
                    lastError: event.message,
                  });
                  break;
              }
            },
            onError(error) {
              const message = errorMessage(error);
              appendMessage({ role: "error", content: message });
              finish({
                isStreaming: false,
                streamingText: "",
                lastError: message,
              });
            },
            onComplete() {
              if (
                streamed &&
                !state.messages.some(
                  (entry) => entry.role === "assistant" && entry.content === streamed,
                )
              ) {
                appendMessage({ role: "assistant", content: streamed });
              }
              finish({ isStreaming: false, streamingText: "" });
            },
          },
        );
      });
    },
    async listSessions() {
      const sessions = (await client.session.list?.query?.()) ?? [];
      return sessions.map(normalizeLiveSession);
    },
    async listArchivedSessions(limit = 20) {
      const sessions = (await client.session.listArchived?.query?.({ limit })) ?? [];
      return sessions.map(normalizeArchivedSession);
    },
    async searchSessions(query: string, limit = 10) {
      const sessions = (await client.session.search?.query?.({ query, limit })) ?? [];
      return sessions.map(normalizeArchivedSession);
    },
    async openSession(sessionId: string) {
      const history = client.chat.history
        ? await client.chat.history.query({ sessionId })
        : { messages: [], archived: false };

      return setState({
        connected: true,
        sessionId,
        sessionStatus: "resumed",
        messages: normalizeHistoryMessages(history.messages),
        streamingText: "",
        isStreaming: false,
        pendingApproval: null,
        pendingQuestion: null,
        lastError: null,
      });
    },
    async approveToolCall(toolCallId: string, approved: boolean) {
      await client.tool?.approve?.mutate({ toolCallId, approved });
      return setState({ pendingApproval: null });
    },
    async acceptToolCallForSession(toolCallId: string) {
      await client.tool?.acceptForSession?.mutate({ toolCallId });
      return setState({ pendingApproval: null });
    },
    async answerQuestion(questionId: string, answer: string) {
      await client.question?.answer?.mutate({ id: questionId, answer });
      appendMessage({
        role: "tool",
        content: `Answer: ${answer}`,
        toolName: "ask_user",
      });
      return setState({ pendingQuestion: null });
    },
  };
}

export function createTargetAriaChatController(
  target: AccessClientTarget,
  options: Omit<AriaChatControllerOptions, "onUpdate"> &
    Pick<AriaChatControllerOptions, "onUpdate">,
): AriaChatController {
  return createAriaChatController(
    createAccessClient(target).client as unknown as AriaChatClient,
    options,
  );
}
