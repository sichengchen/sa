import { createAccessClient, type AccessClientTarget } from "./transport.js";

export type AriaChatMessageRole = "user" | "assistant" | "tool" | "error";

export interface AriaChatMessage {
  role: AriaChatMessageRole;
  content: string;
  toolName?: string;
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
