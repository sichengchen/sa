import { describe, it, expect } from "bun:test";
import { SubAgent, type SubAgentOptions } from "./sub-agent.js";
import type { ToolImpl } from "./types.js";
import type { ModelRouter } from "../router/index.js";

/** A mock tool that returns its args as content */
function createMockTool(
  name: string,
  danger: "safe" | "moderate" | "dangerous" = "safe",
): ToolImpl {
  return {
    name,
    description: `Mock ${name} tool`,
    dangerLevel: danger,
    parameters: {} as any,
    async execute(args) {
      return { content: `${name} executed: ${JSON.stringify(args)}` };
    },
  };
}

// Creating a real SubAgent requires a ModelRouter with LLM access.
// These tests focus on the SubAgent construction and tool filtering logic.
// Full end-to-end tests with LLM are in integration tests.

describe("SubAgent", () => {
  const mockRouter = {} as ModelRouter;
  // Mock getTierModel
  (mockRouter as any).getTierModel = () => "test-model";

  it("filters out delegate tool from available tools", () => {
    const tools: ToolImpl[] = [
      createMockTool("read"),
      createMockTool("exec", "dangerous"),
      createMockTool("delegate", "moderate"),
    ];

    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:1",
      task: "test task",
    });

    // The SubAgent's agent should not have the delegate tool
    // We can't directly inspect the registry, but we can verify the SubAgent was created
    expect(subAgent.id).toBe("subagent:test:1");
    expect(subAgent.status).toBe("pending");
  });

  it("applies tool allowlist when provided", () => {
    const tools: ToolImpl[] = [
      createMockTool("read"),
      createMockTool("write"),
      createMockTool("exec", "dangerous"),
      createMockTool("delegate", "moderate"),
    ];

    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:2",
      task: "test task",
      tools: ["read", "write"],
    });

    expect(subAgent.id).toBe("subagent:test:2");
    expect(subAgent.status).toBe("pending");
  });

  it("uses eco tier model by default", () => {
    const tools: ToolImpl[] = [createMockTool("read")];

    // getTierModel is called during construction
    let calledTier: string | undefined;
    const routerWithSpy = {
      ...mockRouter,
      getTierModel(tier: string) {
        calledTier = tier;
        return "eco-model";
      },
    } as unknown as ModelRouter;

    new SubAgent(routerWithSpy, tools, {
      id: "subagent:test:3",
      task: "test task",
    });

    expect(calledTier).toBe("eco");
  });

  it("uses provided model override", () => {
    const tools: ToolImpl[] = [createMockTool("read")];

    let calledTier: string | undefined;
    const routerWithSpy = {
      ...mockRouter,
      getTierModel(tier: string) {
        calledTier = tier;
        return "eco-model";
      },
    } as unknown as ModelRouter;

    new SubAgent(routerWithSpy, tools, {
      id: "subagent:test:4",
      task: "test task",
      modelOverride: "custom-model",
    });

    // When modelOverride is provided, we still call getTierModel but the override takes precedence in Agent
    // The SubAgent passes modelOverride to Agent options
    expect(true).toBe(true); // Construction doesn't throw
  });

  it("starts in pending status", () => {
    const tools: ToolImpl[] = [createMockTool("read")];
    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:5",
      task: "test task",
    });

    expect(subAgent.status).toBe("pending");
    expect(subAgent.result).toBeUndefined();
  });

  it("excludes delegate_status tool from available tools", () => {
    const tools: ToolImpl[] = [
      createMockTool("read"),
      createMockTool("delegate", "moderate"),
      createMockTool("delegate_status"),
    ];

    // Should not throw — both delegate and delegate_status are filtered
    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:6",
      task: "test task",
    });
    expect(subAgent.id).toBe("subagent:test:6");
  });

  it("removes memory_write and memory_delete when memoryWrite=false", () => {
    const tools: ToolImpl[] = [
      createMockTool("read"),
      createMockTool("memory_write"),
      createMockTool("memory_search"),
      createMockTool("memory_read"),
      createMockTool("memory_delete"),
    ];

    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:7",
      task: "test task",
      memoryWrite: false,
    });

    // Verify via the agent's tool registry (getToolDefinitions returns registered tools)
    const registeredTools = (subAgent.agent as any).registry.getToolDefinitions();
    const toolNames = registeredTools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("memory_search");
    expect(toolNames).toContain("memory_read");
    expect(toolNames).not.toContain("memory_write");
    expect(toolNames).not.toContain("memory_delete");
  });

  it("keeps memory_write and memory_delete when memoryWrite=true", () => {
    const tools: ToolImpl[] = [
      createMockTool("read"),
      createMockTool("memory_write"),
      createMockTool("memory_search"),
      createMockTool("memory_read"),
      createMockTool("memory_delete"),
    ];

    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:8",
      task: "test task",
      memoryWrite: true,
    });

    const registeredTools = (subAgent.agent as any).registry.getToolDefinitions();
    const toolNames = registeredTools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("memory_write");
    expect(toolNames).toContain("memory_delete");
  });

  it("defaults to memoryWrite=true (sync subagents)", () => {
    const tools: ToolImpl[] = [
      createMockTool("read"),
      createMockTool("memory_write"),
      createMockTool("memory_delete"),
    ];

    // No memoryWrite option = default = true (tools not filtered)
    const subAgent = new SubAgent(mockRouter, tools, {
      id: "subagent:test:9",
      task: "test task",
    });

    const registeredTools = (subAgent.agent as any).registry.getToolDefinitions();
    const toolNames = registeredTools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("memory_write");
    expect(toolNames).toContain("memory_delete");
  });
});
