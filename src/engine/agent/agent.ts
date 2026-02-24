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
import { ToolLoopDetector } from "./tool-loop-detection.js";
import { capToolResultSize } from "./tool-result-guard.js";
import type { AgentOptions, AgentEvent, ToolImpl, ToolLoopConfig } from "./types.js";

/** Default agent timeout: 10 minutes (matching OpenClaw) */
const DEFAULT_AGENT_TIMEOUT_MS = 600_000;

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

    // Set up timeout
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    const ac = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = ac && timeoutMs > 0
      ? setTimeout(() => ac.abort(), timeoutMs)
      : null;

    // Set up loop detection
    const loopDetector = this.createLoopDetector();

    try {
      // Unbounded loop — runs until natural completion, timeout, or circuit breaker
      while (true) {
        // Check timeout before each round
        if (ac?.signal.aborted) {
          yield { type: "error", message: `Agent timeout (${timeoutMs / 1000}s) exceeded` };
          return;
        }

        const context: Context = {
          systemPrompt: this.options.systemPrompt,
          messages: this.messages,
          tools: this.registry.getToolDefinitions(),
        };

        const model = this.options.router.getModel(this.options.modelOverride);
        const streamOpts = this.options.router.getStreamOptions(this.options.modelOverride);
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
                args: (event.toolCall.arguments ?? {}) as Record<string, unknown>,
              };
              break;
            case "done": {
              this.messages.push(event.message);

              if (event.reason === "toolUse" && toolCalls.length > 0) {
                // Execute tools and add results to conversation
                let circuitBroken = false;

                for (const tc of toolCalls) {
                  // Check timeout before each tool execution
                  if (ac?.signal.aborted) {
                    yield { type: "error", message: `Agent timeout (${timeoutMs / 1000}s) exceeded` };
                    return;
                  }

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

                  // Check loop detection BEFORE executing
                  if (loopDetector) {
                    const preCheck = loopDetector.checkBeforeExecution(
                      tc.name,
                      tc.arguments as Record<string, unknown>,
                    );

                    if (preCheck.level === "block") {
                      const blocked = {
                        content: `Blocked: ${preCheck.message}`,
                        isError: true,
                      };
                      yield { type: "tool_end", name: tc.name, id: tc.id, result: blocked };
                      yield { type: "warning", message: preCheck.message! };
                      const toolResultMsg: ToolResultMessage = {
                        role: "toolResult",
                        toolCallId: tc.id,
                        toolName: tc.name,
                        content: [{ type: "text", text: blocked.content }],
                        isError: true,
                        timestamp: Date.now(),
                      };
                      this.messages.push(toolResultMsg);
                      continue;
                    }

                    if (preCheck.level === "circuit_breaker") {
                      yield { type: "error", message: `Circuit breaker: ${preCheck.message}` };
                      circuitBroken = true;
                      break;
                    }
                  }

                  const rawResult = await this.registry.execute(tc.name, tc.arguments);

                  // Cap tool result size
                  const result = capToolResultSize(rawResult, this.options.maxToolResultChars);

                  // Record result for loop detection
                  if (loopDetector) {
                    const postCheck = loopDetector.recordResult(
                      tc.name,
                      tc.arguments as Record<string, unknown>,
                      result.content,
                    );
                    if (postCheck.level === "warn") {
                      yield { type: "warning", message: postCheck.message! };
                    }
                  }

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

                if (circuitBroken) return;

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
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /** Create a loop detector based on options */
  private createLoopDetector(): ToolLoopDetector | null {
    const opt = this.options.toolLoopDetection;
    if (opt === false) return null;
    if (opt === undefined || opt === true) return new ToolLoopDetector();
    return new ToolLoopDetector(opt);
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
