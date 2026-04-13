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
    create: {
      mutate(input: {
        connectorType: string;
        prefix: string;
      }): Promise<{ session: { id: string } }>;
    };
  };
  chat: {
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
        const created = await client.session.create.mutate({
          connectorType: options.connectorType,
          prefix: options.prefix,
        });

        return setState({
          connected: true,
          modelName: ping.model,
          agentName: ping.agentName,
          sessionId: created.session.id,
          lastError: null,
        });
      } catch (error) {
        appendMessage({
          role: "error",
          content: `Failed to connect to Aria Server: ${errorMessage(error)}`,
        });
        return setState({
          connected: false,
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
