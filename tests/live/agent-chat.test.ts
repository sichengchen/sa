import { test, expect } from "bun:test";
import { Agent, type AgentEvent } from "@aria/agent-aria";
import {
  describeLive,
  getLiveTestLabel,
  makeLiveRouter,
  resolveLiveProviderSelection,
} from "../helpers/live-model.js";
import { echoTool } from "../helpers/test-tools.js";

/** Collect all events from an agent chat turn */
async function collectEvents(agent: Agent, message: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of agent.chat(message)) {
    events.push(event);
  }
  return events;
}

describeLive("Agent chat — live LLM tests", () => {
  const liveSelection = resolveLiveProviderSelection();

  test("single-turn text response", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [],
      systemPrompt: "Reply with exactly one word.",
    });

    const events = await collectEvents(agent, "Say hello");
    const types = events.map((e) => e.type);

    expect(types).toContain("text_delta");
    expect(types.at(-1)).toBe("done");
    expect(types).not.toContain("error");

    const doneEvent = events.find((e) => e.type === "done") as Extract<
      AgentEvent,
      { type: "done" }
    >;
    expect(doneEvent.stopReason).toBeTruthy();
    expect(getLiveTestLabel(liveSelection)).not.toBe("no-live-provider");
  }, 15_000);

  test("tool use round-trip", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [echoTool],
      systemPrompt: "When asked to echo, use the echo tool. Do not explain — just call the tool.",
    });

    const events = await collectEvents(agent, 'Use the echo tool with message "test123"');
    const types = events.map((e) => e.type);

    expect(types).toContain("tool_start");
    expect(types).toContain("tool_end");
    expect(types.at(-1)).toBe("done");

    const toolStart = events.find((e) => e.type === "tool_start") as Extract<
      AgentEvent,
      { type: "tool_start" }
    >;
    expect(toolStart.name).toBe("echo");

    const toolEnd = events.find((e) => e.type === "tool_end") as Extract<
      AgentEvent,
      { type: "tool_end" }
    >;
    expect(toolEnd.name).toBe("echo");
    expect(toolEnd.result.content).toBeTruthy();
  }, 30_000);

  test("multi-turn conversation accumulates history", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [],
      systemPrompt: "Reply with one word.",
    });

    await collectEvents(agent, "Say hello");
    expect(agent.getMessages().length).toBeGreaterThanOrEqual(2); // user + assistant

    await collectEvents(agent, "Say goodbye");
    // At least 4 messages: user1, assistant1, user2, assistant2
    expect(agent.getMessages().length).toBeGreaterThanOrEqual(4);
  }, 30_000);

  test("streaming event order — text_delta before done", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [],
      systemPrompt: "Reply briefly.",
    });

    const events = await collectEvents(agent, "Hi");
    const types = events.map((e) => e.type);

    const firstTextDelta = types.indexOf("text_delta");
    const doneIndex = types.indexOf("done");

    expect(firstTextDelta).toBeGreaterThanOrEqual(0);
    expect(doneIndex).toBeGreaterThan(firstTextDelta);
    expect(types).not.toContain("error");
  }, 15_000);

  test("tool approval callback — approve", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [echoTool],
      systemPrompt: "Always use the echo tool when asked. Do not explain.",
      onToolApproval: async () => true,
    });

    const events = await collectEvents(agent, 'Echo "approved"');
    const types = events.map((e) => e.type);

    // Tool should have executed since approval returned true
    expect(types).toContain("tool_end");
  }, 30_000);

  test("clearHistory resets conversation", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [],
      systemPrompt: "Reply briefly.",
    });

    await collectEvents(agent, "Hello");
    expect(agent.getMessages().length).toBeGreaterThan(0);

    agent.clearHistory();
    expect(agent.getMessages().length).toBe(0);
  }, 15_000);
});
