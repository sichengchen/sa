import { stream } from "@mariozechner/pi-ai";
import type {
  Message,
  Context,
  ToolCall,
  UserMessage,
  ToolResultMessage,
  AssistantMessage,
} from "@mariozechner/pi-ai";
import { ToolRegistry } from "./registry.js";
import type { AgentOptions, AgentEvent, ToolImpl } from "./types.js";

const DEFAULT_MAX_TOOL_ROUNDS = 10;

export class Agent {
  private registry: ToolRegistry;
  private options: AgentOptions;
  private messages: Message[] = [];

  constructor(options: AgentOptions) {
    this.options = options;
    this.registry = new ToolRegistry();
    for (const tool of options.tools ?? []) {
      this.registry.register(tool);
    }
  }

  /** Stream a chat turn: sends user message, handles tool calls, yields events */
  async *chat(userText: string): AsyncGenerator<AgentEvent> {
    const userMsg: UserMessage = {
      role: "user",
      content: userText,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);

    const maxRounds = this.options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

    for (let round = 0; round <= maxRounds; round++) {
      const context: Context = {
        systemPrompt: this.options.systemPrompt,
        messages: this.messages,
        tools: this.registry.getToolDefinitions(),
      };

      const model = this.options.router.getModel();
      const streamOpts = this.options.router.getStreamOptions();
      const eventStream = stream(model, context, streamOpts);

      const toolCalls: ToolCall[] = [];

      for await (const event of eventStream) {
        switch (event.type) {
          case "text_delta":
            yield { type: "text_delta", delta: event.delta };
            break;
          case "thinking_delta":
            yield { type: "thinking_delta", delta: event.delta };
            break;
          case "toolcall_end":
            toolCalls.push(event.toolCall);
            yield {
              type: "tool_start",
              name: event.toolCall.name,
              id: event.toolCall.id,
            };
            break;
          case "done": {
            this.messages.push(event.message);

            if (event.reason === "toolUse" && toolCalls.length > 0) {
              // Execute tools and add results to conversation
              for (const tc of toolCalls) {
                // If an approval callback is set, request approval first
                if (this.options.onToolApproval) {
                  yield {
                    type: "tool_approval_request",
                    name: tc.name,
                    id: tc.id,
                    args: tc.arguments as Record<string, unknown>,
                  };
                  const approved = await this.options.onToolApproval(
                    tc.name,
                    tc.id,
                    tc.arguments as Record<string, unknown>,
                  );
                  if (!approved) {
                    const rejected = {
                      content: `Tool "${tc.name}" was rejected by the user.`,
                      isError: true,
                    };
                    yield { type: "tool_end", name: tc.name, id: tc.id, result: rejected };
                    const toolResultMsg: ToolResultMessage = {
                      role: "toolResult",
                      toolCallId: tc.id,
                      toolName: tc.name,
                      content: [{ type: "text", text: rejected.content }],
                      isError: true,
                      timestamp: Date.now(),
                    };
                    this.messages.push(toolResultMsg);
                    continue;
                  }
                }

                const result = await this.registry.execute(tc.name, tc.arguments);
                yield {
                  type: "tool_end",
                  name: tc.name,
                  id: tc.id,
                  result,
                };

                const toolResultMsg: ToolResultMessage = {
                  role: "toolResult",
                  toolCallId: tc.id,
                  toolName: tc.name,
                  content: [{ type: "text", text: result.content }],
                  isError: result.isError ?? false,
                  timestamp: Date.now(),
                };
                this.messages.push(toolResultMsg);
              }
              // Continue the loop to send tool results back to the LLM
              break;
            }

            // Not a tool-use stop — we're done
            yield { type: "done", stopReason: event.reason };
            return;
          }
          case "error":
            this.messages.push(event.error);
            yield {
              type: "error",
              message: event.error.errorMessage ?? "Unknown error",
            };
            return;
        }
      }
    }

    yield {
      type: "error",
      message: `Max tool rounds (${maxRounds}) exceeded`,
    };
  }

  /** Get the current conversation messages */
  getMessages(): readonly Message[] {
    return this.messages;
  }

  /** Clear conversation history */
  clearHistory(): void {
    this.messages = [];
  }
}
