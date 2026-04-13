import { describe, it, expect, mock } from "bun:test";
import type { AgentEvent } from "./types.js";

/**
 * Mock pi-ai's stream to simulate LLM responses without a real API key.
 * Must be called BEFORE importing Agent (module-level mock).
 */

/** Helper: collect all events from an agent chat generator */
async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of gen) {
    events.push(e);
  }
  return events;
}

/** Create a mock ModelRouter that satisfies the Agent's interface */
function mockRouter() {
  return {
    getModel: () => ({ provider: "test", model: "test-model" }),
    getStreamOptions: () => ({ temperature: 0.5, maxTokens: 100, apiKey: "test-key" }),
  };
}

describe("Agent — retry context rebuild", () => {
  it("passes sanitized history to stream on retry after retryable error", async () => {
    let callCount = 0;
    // Store raw array references — NOT spreads — so we can assert identity
    const capturedMessageRefs: any[] = [];

    mock.module("@mariozechner/pi-ai", () => ({
      stream: async function* (_model: any, context: any) {
        callCount++;
        capturedMessageRefs.push(context.messages);

        if (callCount === 1) {
          // First call: yield a retryable error (thought_signature)
          yield {
            type: "error",
            error: {
              role: "assistant",
              errorMessage: "thought_signature validation failed",
              timestamp: Date.now(),
            },
          };
        } else {
          // Second call (retry): succeed
          yield {
            type: "done",
            reason: "endTurn",
            message: { role: "assistant", content: "ok", timestamp: Date.now() },
          };
        }
      },
    }));

    const { Agent } = await import("./agent.js");

    const agent = new Agent({
      router: mockRouter() as any,
      timeoutMs: 5000,
      toolLoopDetection: false,
    });

    const events = await collectEvents(agent.chat("hello"));
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();

    // stream was called twice: original + retry
    expect(callCount).toBe(2);
    expect(capturedMessageRefs.length).toBe(2);

    // The retry must receive a DIFFERENT array reference than the original.
    // sanitizeHistoryForRetry returns a new array; the fix assigns it back
    // to context.messages. Without the fix both calls share the same ref.
    expect(capturedMessageRefs[0]).not.toBe(capturedMessageRefs[1]);
  });

  it("removes orphaned tool results left by a prior error assistant message", async () => {
    // Simulate: a previous non-retryable failure pushed an error assistant
    // message whose content included a ToolCall. That message is later
    // sanitized away, but the corresponding toolResult must also be removed
    // so providers don't reject the history with
    // "Message has tool role, but there was no previous assistant message with a tool call".
    let callCount = 0;
    const capturedHistories: any[][] = [];

    mock.module("@mariozechner/pi-ai", () => ({
      stream: async function* (_model: any, context: any) {
        callCount++;
        capturedHistories.push([...context.messages]);

        if (callCount === 1) {
          yield {
            type: "error",
            error: {
              role: "assistant",
              errorMessage: "500 internal server error",
              timestamp: Date.now(),
            },
          };
        } else {
          yield {
            type: "done",
            reason: "endTurn",
            message: { role: "assistant", content: "recovered", timestamp: Date.now() },
          };
        }
      },
    }));

    const { Agent } = await import("./agent.js");

    const agent = new Agent({
      router: mockRouter() as any,
      timeoutMs: 5000,
      toolLoopDetection: false,
    });

    // Manually seed history as if a prior turn failed after tool use:
    // user → assistant(toolCalls) → toolResult → assistant(error)
    const seededMessages: any[] = [
      { role: "user", content: "first turn", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-ok", name: "read", arguments: {} }],
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "tc-ok",
        toolName: "read",
        content: [{ type: "text", text: "file contents" }],
        isError: false,
        timestamp: 3,
      },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-orphan", name: "write", arguments: {} }],
        errorMessage: "500 server blew up",
        timestamp: 4,
      },
      {
        role: "toolResult",
        toolCallId: "tc-orphan",
        toolName: "write",
        content: [{ type: "text", text: "should be removed" }],
        isError: false,
        timestamp: 5,
      },
    ];

    // Inject seeded history (access private field for test)
    (agent as any).messages = seededMessages;

    const events = await collectEvents(agent.chat("retry please"));
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();

    // The retry (call 2) should have received sanitized history:
    // - assistant(error) removed
    // - toolResult for tc-orphan removed (orphaned)
    // - assistant(tc-ok) and its toolResult kept
    expect(capturedHistories.length).toBe(2);
    const retryHistory = capturedHistories[1];

    // No messages with errorMessage
    const errorMsgs = retryHistory.filter((m: any) => m.errorMessage);
    expect(errorMsgs.length).toBe(0);

    // No orphaned tool results — tc-orphan should be gone
    const orphans = retryHistory.filter(
      (m: any) => m.role === "toolResult" && m.toolCallId === "tc-orphan",
    );
    expect(orphans.length).toBe(0);

    // The valid tool result (tc-ok) should still be present
    const validResults = retryHistory.filter(
      (m: any) => m.role === "toolResult" && m.toolCallId === "tc-ok",
    );
    expect(validResults.length).toBe(1);
  });
});

describe("Agent — timeout AbortController", () => {
  it("yields error when timeout fires between loop iterations (multi-tool rounds)", async () => {
    // The timeout check happens at the top of the while loop (between rounds)
    // and before each tool execution. To trigger it, we need a tool call that
    // takes longer than the timeout, causing the next loop iteration to detect abort.
    let callCount = 0;
    mock.module("@mariozechner/pi-ai", () => ({
      stream: async function* () {
        callCount++;
        if (callCount <= 2) {
          // Return a tool call each round
          yield {
            type: "toolcall_end",
            toolCall: { id: `tc${callCount}`, name: "fast_tool", arguments: {} },
          };
          yield {
            type: "done",
            reason: "toolUse",
            message: {
              role: "assistant",
              content: "",
              toolCalls: [{ id: `tc${callCount}`, name: "fast_tool", arguments: {} }],
              timestamp: Date.now(),
            },
          };
        } else {
          yield {
            type: "done",
            reason: "endTurn",
            message: { role: "assistant", content: "done", timestamp: Date.now() },
          };
        }
      },
    }));

    const { Agent } = await import("./agent.js");
    const { Type } = await import("@sinclair/typebox");

    const agent = new Agent({
      router: mockRouter() as any,
      timeoutMs: 50,
      toolLoopDetection: false,
      tools: [
        {
          name: "fast_tool",
          description: "A tool that finishes quickly but round-trips add up",
          dangerLevel: "safe",
          parameters: Type.Object({}),
          execute: async () => {
            // Each call takes 30ms; with 2 calls the total exceeds 50ms timeout
            await new Promise((r) => setTimeout(r, 30));
            return { content: "ok" };
          },
        },
      ],
    });

    const events = await collectEvents(agent.chat("use the tool twice"));
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent as any).message).toContain("timeout");
  });

  it("yields error when timeout fires between tool call rounds", async () => {
    let callCount = 0;
    mock.module("@mariozechner/pi-ai", () => ({
      stream: async function* () {
        callCount++;
        if (callCount === 1) {
          // First call: return a tool call
          yield {
            type: "toolcall_end",
            toolCall: { id: "tc1", name: "slow_tool", arguments: {} },
          };
          yield {
            type: "done",
            reason: "toolUse",
            message: {
              role: "assistant",
              content: "",
              toolCalls: [{ id: "tc1", name: "slow_tool", arguments: {} }],
              timestamp: Date.now(),
            },
          };
        } else {
          // Second call: should not reach here if timeout works
          yield {
            type: "done",
            reason: "endTurn",
            message: { role: "assistant", content: "done", timestamp: Date.now() },
          };
        }
      },
    }));

    const { Agent } = await import("./agent.js");
    const { Type } = await import("@sinclair/typebox");

    const agent = new Agent({
      router: mockRouter() as any,
      timeoutMs: 50,
      toolLoopDetection: false,
      tools: [
        {
          name: "slow_tool",
          description: "A tool that takes a while",
          dangerLevel: "safe",
          parameters: Type.Object({}),
          execute: async () => {
            // Delay long enough for the 50ms timeout to fire
            await new Promise((r) => setTimeout(r, 100));
            return { content: "done" };
          },
        },
      ],
    });

    const events = await collectEvents(agent.chat("use the tool"));
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent as any).message).toContain("timeout");
  });

  it("does not set up abort controller when timeoutMs is 0", async () => {
    mock.module("@mariozechner/pi-ai", () => ({
      stream: async function* () {
        yield {
          type: "done",
          reason: "endTurn",
          message: { role: "assistant", content: "hi", timestamp: Date.now() },
        };
      },
    }));

    const { Agent } = await import("./agent.js");

    const agent = new Agent({
      router: mockRouter() as any,
      timeoutMs: 0,
      toolLoopDetection: false,
    });

    const events = await collectEvents(agent.chat("hello"));
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    // No error — no timeout
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeUndefined();
  });
});
