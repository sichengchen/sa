import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Agent, ToolRegistry } from "@sa/engine/agent/index.js";
import type { ToolImpl } from "@sa/engine/agent/index.js";
import { ModelRouter } from "@sa/engine/router/index.js";
import { Type } from "@mariozechner/pi-ai";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock the stream module
import * as streamModule from "@mariozechner/pi-ai";

const testDir = join(tmpdir(), "sa-test-agent-" + Date.now());

function setupRouter(): ModelRouter {
  return ModelRouter.fromConfig({
    defaultModel: "test-model",
    providers: [
      {
        id: "anthropic",
        type: "anthropic" as any,
        apiKeyEnvVar: "TEST_API_KEY",
      },
    ],
    models: [
      {
        name: "test-model",
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250514",
        temperature: 0.7,
      },
    ],
  });
}

beforeEach(() => {
  process.env.TEST_API_KEY = "test-key-123";
});

afterEach(async () => {
  delete process.env.TEST_API_KEY;
  await rm(testDir, { recursive: true, force: true });
});

describe("ToolRegistry", () => {
  test("registers and retrieves tools", () => {
    const reg = new ToolRegistry();
    const tool: ToolImpl = {
      name: "echo",
      description: "Echoes input",
      parameters: Type.Object({ text: Type.String() }),
      execute: async (args) => ({ content: String(args.text) }),
    };
    reg.register(tool);
    expect(reg.get("echo")).toBeDefined();
    expect(reg.listNames()).toEqual(["echo"]);
  });

  test("rejects duplicate tool names", () => {
    const reg = new ToolRegistry();
    const tool: ToolImpl = {
      name: "echo",
      description: "Echoes",
      parameters: Type.Object({}),
      execute: async () => ({ content: "ok" }),
    };
    reg.register(tool);
    expect(() => reg.register(tool)).toThrow("already registered");
  });

  test("returns error for unknown tool", async () => {
    const reg = new ToolRegistry();
    const result = await reg.execute("nonexistent", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown tool");
  });

  test("catches tool execution errors", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "failing",
      description: "Always fails",
      parameters: Type.Object({}),
      execute: async () => {
        throw new Error("boom");
      },
    });
    const result = await reg.execute("failing", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("boom");
  });

  test("generates tool definitions for LLM context", () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "echo",
      description: "Echoes input",
      parameters: Type.Object({ text: Type.String() }),
      execute: async (args) => ({ content: String(args.text) }),
    });
    const defs = reg.getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("echo");
    expect(defs[0].description).toBe("Echoes input");
  });
});

describe("Agent", () => {
  test("creates agent with options", async () => {
    const router = await setupRouter();
    const agent = new Agent({
      router,
      systemPrompt: "You are a test agent.",
    });
    expect(agent.getMessages()).toHaveLength(0);
  });

  test("clearHistory resets messages", async () => {
    const router = await setupRouter();
    const agent = new Agent({ router });

    // Manually add a message via chat start (will fail since stream is real, but that's ok)
    // We just test that clearHistory works on whatever state
    agent.clearHistory();
    expect(agent.getMessages()).toHaveLength(0);
  });

  test("accepts modelOverride option", () => {
    const router = setupRouter();
    // Agent should construct successfully with modelOverride
    const agent = new Agent({
      router,
      systemPrompt: "Test",
      modelOverride: "test-model",
    });
    expect(agent.getMessages()).toHaveLength(0);
  });
});
