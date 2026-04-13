import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Orchestrator } from "./orchestrator.js";
import type { ModelRouter } from "../router/index.js";
import type { ToolImpl } from "./types.js";

// Minimal mock router
function createMockRouter(): ModelRouter {
  return {
    getTierModel: () => "mock-model",
    getActiveModelName: () => "mock-model",
  } as unknown as ModelRouter;
}

// Minimal mock tools
function createMockTools(): ToolImpl[] {
  return [
    {
      name: "read",
      description: "Read a file",
      dangerLevel: "safe",
      parameters: Type.Object({}),
      async execute() {
        return { content: "ok" };
      },
    },
  ];
}

describe("Orchestrator", () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator(createMockRouter(), createMockTools(), {
      maxConcurrent: 2,
      maxSubAgentsPerTurn: 5,
      resultRetentionMs: 1000,
    });
  });

  it("tracks spawn count", () => {
    expect(orchestrator.runningCount).toBe(0);
    expect(orchestrator.completedCount).toBe(0);
  });

  it("enforces per-turn spawn limit", () => {
    const orch = new Orchestrator(createMockRouter(), createMockTools(), {
      maxConcurrent: 10,
      maxSubAgentsPerTurn: 2,
    });

    // These should succeed (even though SubAgent.run will fail due to mock router)
    orch.spawnBackground({ id: "a", task: "task-a" });
    orch.spawnBackground({ id: "b", task: "task-b" });

    // Third should throw
    expect(() => orch.spawnBackground({ id: "c", task: "task-c" })).toThrow(
      "Max sub-agents per turn (2) reached",
    );
  });

  it("resets turn counter", () => {
    const orch = new Orchestrator(createMockRouter(), createMockTools(), {
      maxConcurrent: 10,
      maxSubAgentsPerTurn: 1,
    });

    orch.spawnBackground({ id: "a", task: "task-a" });
    expect(() => orch.spawnBackground({ id: "b", task: "task-b" })).toThrow();

    orch.resetTurnCounter();
    // After reset, should be able to spawn again
    orch.spawnBackground({ id: "c", task: "task-c" });
    expect(orch.runningCount).toBeGreaterThanOrEqual(1);
  });

  it("queues sub-agents when concurrency limit reached", () => {
    // maxConcurrent: 2
    orchestrator.spawnBackground({ id: "a", task: "task-a" });
    orchestrator.spawnBackground({ id: "b", task: "task-b" });

    // Running count should be 2
    expect(orchestrator.runningCount).toBe(2);

    // Third should be queued (not running, not throwing)
    orchestrator.spawnBackground({ id: "c", task: "task-c" });
    expect(orchestrator.runningCount).toBe(2); // still 2 — c is queued
  });

  it("returns running status for active sub-agents", () => {
    orchestrator.spawnBackground({ id: "test-1", task: "some task" });
    const status = orchestrator.getStatus("test-1");
    expect(status).not.toBeNull();
    expect(status!.status).toBe("running");
    expect(status!.task).toBe("some task");
    expect(status!.startedAt).toBeGreaterThan(0);
  });

  it("returns null for unknown sub-agent", () => {
    expect(orchestrator.getStatus("nonexistent")).toBeNull();
  });

  it("lists all sub-agents", () => {
    orchestrator.spawnBackground({ id: "a", task: "task-a" });
    orchestrator.spawnBackground({ id: "b", task: "task-b" });

    const list = orchestrator.list();
    expect(list.length).toBe(2);
    expect(list.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("cancels a running sub-agent", () => {
    orchestrator.spawnBackground({ id: "x", task: "task-x" });
    expect(orchestrator.runningCount).toBe(1);

    const cancelled = orchestrator.cancel("x");
    expect(cancelled).toBe(true);
    expect(orchestrator.runningCount).toBe(0);

    const status = orchestrator.getStatus("x");
    expect(status).not.toBeNull();
    expect(status!.status).toBe("cancelled");
  });

  it("returns false when cancelling non-running sub-agent", () => {
    expect(orchestrator.cancel("nonexistent")).toBe(false);
  });
});
