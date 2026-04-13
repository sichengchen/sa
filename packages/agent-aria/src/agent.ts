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
import { sanitizeContent } from "./content-frame.js";
import type { AgentOptions, AgentEvent } from "./types.js";

/** Default agent timeout: 10 minutes (matching OpenClaw) */
const DEFAULT_AGENT_TIMEOUT_MS = 600_000;

/** Max retries for transient provider errors */
const MAX_STREAM_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 1000;

/** Check if a provider error is retryable */
function isRetryableError(errorMessage: string): boolean {
  // HTTP 429 (rate limit), 500 (server error), 503 (service unavailable)
  if (/\b429\b/.test(errorMessage)) return true;
  if (/\b500\b/.test(errorMessage)) return true;
  if (/\b503\b/.test(errorMessage)) return true;
  if (/rate.?limit/i.test(errorMessage)) return true;
  if (/overloaded/i.test(errorMessage)) return true;
  if (/exceeded.*quota/i.test(errorMessage)) return true;
  // Gemini thought_signature errors are retryable after history sanitization
  if (/thought_signature/i.test(errorMessage)) return true;
  return false;
}

/** Log stream error metadata for diagnostics */
function logStreamError(
  errorMessage: string,
  modelName: string,
  messageCount: number,
  toolCount: number,
  attempt: number,
): void {
  console.warn(
    `[agent] Stream error (attempt ${attempt}): model=${modelName}, messages=${messageCount}, tools=${toolCount}: ${errorMessage.slice(0, 200)}`,
  );
}

/**
 * Sanitize message history for provider retry.
 *
 * 1. Removes assistant messages that carry `errorMessage` (failed attempts).
 * 2. Removes orphaned toolResult messages whose toolCallId no longer matches
 *    any ToolCall in a preceding assistant message. This prevents the
 *    "Message has tool role, but there was no previous assistant message
 *    with a tool call" error that providers emit when the history is malformed.
 */
function sanitizeHistoryForRetry(messages: Message[]): Message[] {
  // Pass 1 — drop error assistant messages
  const filtered: Message[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && (msg as AssistantMessage).errorMessage) {
      continue;
    }
    filtered.push(msg);
  }

  // Pass 2 — collect valid tool-call IDs from remaining assistant messages,
  // then drop any toolResult whose ID is not in the set.
  const validToolCallIds = new Set<string>();
  for (const msg of filtered) {
    if (msg.role === "assistant") {
      const content = (msg as AssistantMessage).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === "object" && "type" in block && block.type === "toolCall") {
            validToolCallIds.add((block as ToolCall).id);
          }
        }
      }
    }
  }

  const result: Message[] = [];
  for (const msg of filtered) {
    if (msg.role === "toolResult") {
      const tr = msg as ToolResultMessage;
      if (!validToolCallIds.has(tr.toolCallId)) {
        continue; // orphaned tool result — skip
      }
    }
    result.push(msg);
  }

  return result;
}

export class Agent {
  private registry: ToolRegistry;
  private options: AgentOptions;
  private messages: Message[] = [];
  /** Current active AbortController — set during chat(), null when idle */
  private activeAbortController: AbortController | null = null;

  constructor(options: AgentOptions) {
    this.options = options;
    this.registry = new ToolRegistry();
    for (const tool of options.tools ?? []) {
      this.registry.register(tool);
    }
  }

  /** Whether the agent is currently running a chat turn */
  get isRunning(): boolean {
    return this.activeAbortController !== null;
  }

  /** Abort the current chat turn. No-op if idle. */
  abort(): boolean {
    if (!this.activeAbortController) return false;
    this.activeAbortController.abort();
    return true;
  }

  private resolveSystemPrompt(): string | undefined {
    return this.options.getSystemPrompt?.() ?? this.options.systemPrompt;
  }

  /** Stream a chat turn: sends user message, handles tool calls, yields events */
  async *chat(userText: string): AsyncGenerator<AgentEvent> {
    const userMsg: UserMessage = {
      role: "user",
      content: userText,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);

    // Set up timeout and external abort support
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    const ac = new AbortController();
    this.activeAbortController = ac;
    const timeoutId = timeoutMs > 0 ? setTimeout(() => ac.abort(), timeoutMs) : null;

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
          systemPrompt: this.resolveSystemPrompt(),
          messages: this.messages,
          tools: this.registry.getToolDefinitions(),
        };

        const model = this.options.router.getModel(this.options.modelOverride);
        const streamOpts = this.options.router.getStreamOptions(this.options.modelOverride);

        // Retry loop for transient provider errors
        let lastError: string | null = null;
        let streamSucceeded = false;

        for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
          const eventStream = stream(model, context, streamOpts);
          const toolCalls: ToolCall[] = [];
          let shouldRetry = false;

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
                      yield {
                        type: "error",
                        message: `Agent timeout (${timeoutMs / 1000}s) exceeded`,
                      };
                      return;
                    }

                    // Intercept ask_user tool — handle via onAskUser callback
                    if (tc.name === "ask_user" && this.options.onAskUser) {
                      const args = tc.arguments as Record<string, unknown>;
                      const question = String(args.question ?? "");
                      const rawOptions = args.options;
                      const options =
                        Array.isArray(rawOptions) && rawOptions.length > 0
                          ? rawOptions.map(String)
                          : undefined;

                      yield { type: "user_question", id: tc.id, question, options };

                      try {
                        const answer = await this.options.onAskUser(tc.id, question, options);
                        const result = { content: answer, isError: false };
                        yield { type: "tool_end", name: tc.name, id: tc.id, result };
                        const toolResultMsg: ToolResultMessage = {
                          role: "toolResult",
                          toolCallId: tc.id,
                          toolName: tc.name,
                          content: [{ type: "text", text: answer }],
                          isError: false,
                          timestamp: Date.now(),
                        };
                        this.messages.push(toolResultMsg);
                      } catch (err) {
                        const errMsg = err instanceof Error ? err.message : String(err);
                        const result = {
                          content: `Question timed out or failed: ${errMsg}`,
                          isError: true,
                        };
                        yield { type: "tool_end", name: tc.name, id: tc.id, result };
                        const toolResultMsg: ToolResultMessage = {
                          role: "toolResult",
                          toolCallId: tc.id,
                          toolName: tc.name,
                          content: [{ type: "text", text: result.content }],
                          isError: true,
                          timestamp: Date.now(),
                        };
                        this.messages.push(toolResultMsg);
                      }
                      continue;
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

                    // Sanitize + cap tool result size
                    const sanitized = {
                      ...rawResult,
                      content: sanitizeContent(rawResult.content),
                    };
                    const result = capToolResultSize(sanitized, this.options.maxToolResultChars);

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

                  // Continue the outer while loop to send tool results back to the LLM
                  streamSucceeded = true;
                  break;
                }

                // Not a tool-use stop — we're done
                yield { type: "done", stopReason: event.reason };
                return;
              }
              case "error": {
                const errorMsg = event.error.errorMessage ?? "Unknown error";
                const modelName = model.id ?? "unknown";
                logStreamError(
                  errorMsg,
                  modelName,
                  this.messages.length,
                  context.tools?.length ?? 0,
                  attempt,
                );

                if (
                  attempt <= MAX_STREAM_RETRIES &&
                  isRetryableError(errorMsg) &&
                  !ac?.signal.aborted
                ) {
                  // Don't push the error message into history — it would corrupt the conversation
                  // Sanitize history in case the error was caused by malformed messages
                  this.messages = sanitizeHistoryForRetry(this.messages);
                  context.messages = this.messages;
                  shouldRetry = true;
                  lastError = errorMsg;
                  yield {
                    type: "warning",
                    message: `Provider error, retrying (${attempt}/${MAX_STREAM_RETRIES})...`,
                  };
                } else {
                  // Final failure — push error and yield
                  this.messages.push(event.error);
                  yield { type: "error", message: errorMsg };
                  return;
                }
                break;
              }
            }

            if (shouldRetry) break; // Break out of event loop to retry
          }

          if (streamSucceeded) break; // Break retry loop — tool use succeeded, continue outer while

          if (shouldRetry && attempt <= MAX_STREAM_RETRIES) {
            // Exponential backoff before retry
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          if (!streamSucceeded && !shouldRetry) {
            // Stream completed without tool use or error — already returned above
            return;
          }
        }

        // If we exhausted retries without success, yield the last error
        if (!streamSucceeded && lastError) {
          yield { type: "error", message: lastError };
          return;
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.activeAbortController = null;
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

  /** Replace the current conversation history with persisted messages. */
  hydrateHistory(messages: readonly Message[]): void {
    this.messages = Array.from(messages);
  }

  /** Clear conversation history */
  clearHistory(): void {
    this.messages = [];
  }
}
