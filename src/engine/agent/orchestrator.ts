/**
 * Orchestrator — manages background sub-agent execution with concurrency limits.
 */

import { SubAgent, type SubAgentOptions, type SubAgentResult } from "./sub-agent.js";
import type { ToolImpl } from "./types.js";
import type { ModelRouter } from "../router/index.js";

export interface OrchestrationConfig {
  /** Max concurrent sub-agents (default: 3) */
  maxConcurrent?: number;
  /** Max sub-agents spawned per agent turn (default: 10) */
  maxSubAgentsPerTurn?: number;
  /** Result retention time in ms (default: 1_800_000 = 30 min) */
  resultRetentionMs?: number;
  /** Default sub-agent timeout in ms */
  defaultTimeoutMs?: number;
  /** Optional session-scoped sub-agent factory */
  createSubAgent?: (options: SubAgentOptions) => SubAgent;
}

export interface SubAgentStatus {
  id: string;
  task: string;
  status: "running" | "done" | "error" | "cancelled";
  result?: string;
  error?: string;
  toolCalls?: { name: string; summary: string }[];
  startedAt: number;
  completedAt?: number;
}

interface RunningEntry {
  subAgent: SubAgent;
  task: string;
  promise: Promise<SubAgentResult>;
  startedAt: number;
}

interface CompletedEntry {
  task: string;
  result: SubAgentResult;
  startedAt: number;
  completedAt: number;
}

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_PER_TURN = 10;
const DEFAULT_RETENTION_MS = 30 * 60 * 1000; // 30 min

export class Orchestrator {
  private running = new Map<string, RunningEntry>();
  private completed = new Map<string, CompletedEntry>();
  private cancelled = new Set<string>();
  private queue: Array<{ options: SubAgentOptions; resolve: (id: string) => void }> = [];

  private maxConcurrent: number;
  private maxPerTurn: number;
  private resultRetentionMs: number;
  private defaultTimeoutMs?: number;
  private createSubAgent?: (options: SubAgentOptions) => SubAgent;
  private turnSpawnCount = 0;

  private router: ModelRouter;
  private tools: ToolImpl[];

  constructor(router: ModelRouter, tools: ToolImpl[], config?: OrchestrationConfig) {
    this.router = router;
    this.tools = tools;
    this.maxConcurrent = config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.maxPerTurn = config?.maxSubAgentsPerTurn ?? DEFAULT_MAX_PER_TURN;
    this.resultRetentionMs = config?.resultRetentionMs ?? DEFAULT_RETENTION_MS;
    this.defaultTimeoutMs = config?.defaultTimeoutMs;
    this.createSubAgent = config?.createSubAgent;
  }

  /** Spawn a background sub-agent, return its ID immediately */
  spawnBackground(options: SubAgentOptions): string {
    if (this.turnSpawnCount >= this.maxPerTurn) {
      throw new Error(`Max sub-agents per turn (${this.maxPerTurn}) reached`);
    }
    this.turnSpawnCount++;

    const id = options.id;
    if (!options.timeoutMs && this.defaultTimeoutMs) {
      options.timeoutMs = this.defaultTimeoutMs;
    }

    if (this.running.size >= this.maxConcurrent) {
      // Queue the spawn — will be started when a running sub-agent completes
      this.queue.push({ options, resolve: () => {} });
      return id;
    }

    this.startSubAgent(options);
    return id;
  }

  private startSubAgent(options: SubAgentOptions): void {
    const subAgent = this.createSubAgent
      ? this.createSubAgent(options)
      : new SubAgent(this.router, this.tools, options);
    const startedAt = Date.now();

    const promise = subAgent.run(options.task).then((result) => {
      this.running.delete(options.id);

      if (this.cancelled.has(options.id)) {
        this.cancelled.delete(options.id);
        return result;
      }

      this.completed.set(options.id, {
        task: options.task,
        result,
        startedAt,
        completedAt: Date.now(),
      });

      // Process queue
      this.processQueue();

      return result;
    });

    this.running.set(options.id, { subAgent, task: options.task, promise, startedAt });
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
      const queued = this.queue.shift()!;
      this.startSubAgent(queued.options);
      queued.resolve(queued.options.id);
    }
  }

  /** Get status of a specific sub-agent */
  getStatus(subAgentId: string): SubAgentStatus | null {
    // Check running
    const running = this.running.get(subAgentId);
    if (running) {
      return {
        id: subAgentId,
        task: running.task,
        status: "running",
        startedAt: running.startedAt,
      };
    }

    // Check cancelled
    if (this.cancelled.has(subAgentId)) {
      return {
        id: subAgentId,
        task: "",
        status: "cancelled",
        startedAt: 0,
      };
    }

    // Check completed
    const completed = this.completed.get(subAgentId);
    if (completed) {
      return {
        id: subAgentId,
        task: completed.task,
        status: completed.result.status === "done" ? "done" : "error",
        result: completed.result.output,
        error: completed.result.error,
        toolCalls: completed.result.toolCalls,
        startedAt: completed.startedAt,
        completedAt: completed.completedAt,
      };
    }

    return null;
  }

  /** List all sub-agents (running + completed) */
  list(): SubAgentStatus[] {
    const statuses: SubAgentStatus[] = [];

    for (const [id, entry] of this.running) {
      statuses.push({
        id,
        task: entry.task,
        status: "running",
        startedAt: entry.startedAt,
      });
    }

    for (const [id, entry] of this.completed) {
      statuses.push({
        id,
        task: entry.task,
        status: entry.result.status === "done" ? "done" : "error",
        result: entry.result.output,
        error: entry.result.error,
        toolCalls: entry.result.toolCalls,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
      });
    }

    return statuses;
  }

  /** Cancel a running sub-agent */
  cancel(subAgentId: string): boolean {
    const entry = this.running.get(subAgentId);
    if (!entry) return false;

    this.cancelled.add(subAgentId);
    this.running.delete(subAgentId);
    return true;
  }

  /** Cleanup completed results older than retention TTL */
  cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.completed) {
      if (now - entry.completedAt > this.resultRetentionMs) {
        this.completed.delete(id);
      }
    }
  }

  /** Reset per-turn spawn counter (call at the start of each agent turn) */
  resetTurnCounter(): void {
    this.turnSpawnCount = 0;
  }

  /** Get count of currently running sub-agents */
  get runningCount(): number {
    return this.running.size;
  }

  /** Get count of completed sub-agents */
  get completedCount(): number {
    return this.completed.size;
  }
}
