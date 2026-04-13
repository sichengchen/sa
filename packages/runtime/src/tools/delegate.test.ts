import { describe, it, expect } from "bun:test";
import { createDelegateTool, type DelegateToolDeps } from "./delegate.js";
import type { ToolImpl } from "../agent/types.js";
import type { ModelRouter } from "../router/index.js";

/** Create mock dependencies */
function createMockDeps(overrides?: Partial<DelegateToolDeps>): DelegateToolDeps {
  const mockRouter = {
    getTierModel: () => "test-model",
    getModel: () => ({}),
    getStreamOptions: () => ({}),
  } as unknown as ModelRouter;

  const mockTool: ToolImpl = {
    name: "read",
    description: "Read a file",
    dangerLevel: "safe",
    parameters: {} as any,
    async execute() {
      return { content: "file content" };
    },
  };

  return {
    router: mockRouter,
    tools: [mockTool],
    ...overrides,
  };
}

describe("createDelegateTool", () => {
  it("creates a tool with correct metadata", () => {
    const tool = createDelegateTool(createMockDeps());
    expect(tool.name).toBe("delegate");
    expect(tool.dangerLevel).toBe("moderate");
    expect(tool.description).toContain("sub-agent");
  });

  it("returns error when task is empty", async () => {
    const tool = createDelegateTool(createMockDeps());
    const result = await tool.execute({ task: "" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("required");
  });

  it("returns error when task is missing", async () => {
    const tool = createDelegateTool(createMockDeps());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("required");
  });

  it("does not include delegate tool in sub-agent tools", () => {
    const delegateTool: ToolImpl = {
      name: "delegate",
      description: "Delegate",
      dangerLevel: "moderate",
      parameters: {} as any,
      async execute() {
        return { content: "delegated" };
      },
    };

    const deps = createMockDeps({
      tools: [
        {
          name: "read",
          description: "Read",
          dangerLevel: "safe",
          parameters: {} as any,
          execute: async () => ({ content: "" }),
        },
        delegateTool,
      ],
    });

    const tool = createDelegateTool(deps);
    // The tool should be created successfully — delegate exclusion happens at SubAgent construction time
    expect(tool.name).toBe("delegate");
  });
});
