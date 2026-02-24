import { describe, it, expect } from "bun:test";
import { createDelegateStatusTool } from "./delegate-status.js";
import type { Orchestrator, SubAgentStatus } from "../agent/orchestrator.js";

function createMockOrchestrator(statuses: SubAgentStatus[]): Orchestrator {
  return {
    getStatus(id: string) {
      return statuses.find((s) => s.id === id) ?? null;
    },
    list() {
      return statuses;
    },
  } as unknown as Orchestrator;
}

describe("delegate_status tool", () => {
  it("has correct metadata", () => {
    const tool = createDelegateStatusTool({ getOrchestrator: () => undefined });
    expect(tool.name).toBe("delegate_status");
    expect(tool.dangerLevel).toBe("safe");
  });

  it("reports no sub-agents when orchestrator is undefined", async () => {
    const tool = createDelegateStatusTool({ getOrchestrator: () => undefined });
    const result = await tool.execute({});
    expect(result.content).toContain("No background sub-agents");
  });

  it("reports no sub-agents when list is empty", async () => {
    const tool = createDelegateStatusTool({
      getOrchestrator: () => createMockOrchestrator([]),
    });
    const result = await tool.execute({});
    expect(result.content).toContain("No background sub-agents");
  });

  it("returns status for specific sub-agent", async () => {
    const statuses: SubAgentStatus[] = [
      { id: "sa-1", task: "find files", status: "done", result: "found 3 files", startedAt: 1000, completedAt: 2000 },
    ];
    const tool = createDelegateStatusTool({
      getOrchestrator: () => createMockOrchestrator(statuses),
    });

    const result = await tool.execute({ id: "sa-1" });
    const parsed = JSON.parse(result.content);
    expect(parsed.status).toBe("done");
    expect(parsed.result).toBe("found 3 files");
  });

  it("returns error for unknown sub-agent ID", async () => {
    const tool = createDelegateStatusTool({
      getOrchestrator: () => createMockOrchestrator([]),
    });

    const result = await tool.execute({ id: "nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Sub-agent not found");
  });

  it("lists all sub-agents with formatted output", async () => {
    const now = Date.now();
    const statuses: SubAgentStatus[] = [
      { id: "sa-1", task: "task a", status: "running", startedAt: now - 5000 },
      { id: "sa-2", task: "task b", status: "done", result: "completed successfully", startedAt: now - 10000, completedAt: now - 3000 },
    ];
    const tool = createDelegateStatusTool({
      getOrchestrator: () => createMockOrchestrator(statuses),
    });

    const result = await tool.execute({});
    expect(result.content).toContain("[running] sa-1");
    expect(result.content).toContain("[done] sa-2");
    expect(result.content).toContain("completed successfully");
  });
});
