/**
 * SubAgent — a child agent spawned by the parent via the `delegate` tool.
 *
 * Runs synchronously to completion, returns a structured result.
 * Auto-approves all tool calls, uses filtered tool registry (no `delegate`).
 */

import { Agent } from "./agent.js";
import type { ModelRouter } from "@aria/gateway/router";
import type { ToolImpl } from "./types.js";

export interface SubAgentOptions {
  /** Unique sub-agent ID: "subagent:<parentSessionId>:<uuid>" */
  id: string;
  /** The task prompt for the sub-agent */
  task: string;
  /** Model override (default: eco tier via router) */
  modelOverride?: string;
  /** Tool name allowlist — if provided, only these tools are available. Always excludes "delegate". */
  tools?: string[];
  /** Per-subagent timeout in ms (default: 120_000) */
  timeoutMs?: number;
  /** Whether this sub-agent can write/delete memory (default: true for sync, false for background) */
  memoryWrite?: boolean;
  /** Optional focused system prompt override */
  systemPrompt?: string;
}

export interface SubAgentResult {
  output: string;
  toolCalls: { name: string; summary: string }[];
  status: "done" | "error";
  error?: string;
}

const DEFAULT_SUBAGENT_TIMEOUT_MS = 120_000;

const SUBAGENT_SYSTEM_PROMPT = `You are a focused sub-agent executing a specific task. Complete the task efficiently using available tools. Be concise in your response — return only the result, not narration about your process.`;

export class SubAgent {
  readonly id: string;
  readonly agent: Agent;
  status: "pending" | "running" | "done" | "error" = "pending";
  result?: SubAgentResult;

  constructor(router: ModelRouter, allTools: ToolImpl[], options: SubAgentOptions) {
    this.id = options.id;

    // Filter tools: exclude "delegate" and "delegate_status" to prevent recursion
    let filteredTools = allTools.filter(
      (t) => t.name !== "delegate" && t.name !== "delegate_status",
    );

    // If memory write is disabled, remove write/delete memory tools (keep read-only)
    if (options.memoryWrite === false) {
      filteredTools = filteredTools.filter(
        (t) => t.name !== "memory_write" && t.name !== "memory_delete",
      );
    }

    // If a tool allowlist is provided, apply it
    if (options.tools && options.tools.length > 0) {
      const allowed = new Set(options.tools);
      filteredTools = filteredTools.filter((t) => allowed.has(t.name));
    }

    // Determine model: use override, else eco tier
    const modelOverride = options.modelOverride ?? router.getTierModel("eco");

    this.agent = new Agent({
      router,
      tools: filteredTools,
      systemPrompt: options.systemPrompt ?? SUBAGENT_SYSTEM_PROMPT,
      modelOverride,
      timeoutMs: options.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS,
      // Auto-approve all tool calls — subagent runs without user interaction
      onToolApproval: async () => true,
    });
  }

  /** Run the sub-agent to completion */
  async run(task: string): Promise<SubAgentResult> {
    this.status = "running";

    let output = "";
    const toolCalls: { name: string; summary: string }[] = [];

    try {
      for await (const event of this.agent.chat(task)) {
        switch (event.type) {
          case "text_delta":
            output += event.delta;
            break;
          case "tool_end":
            toolCalls.push({
              name: event.name,
              summary: event.result.content.slice(0, 200),
            });
            break;
          case "error":
            this.status = "error";
            this.result = {
              output: output || event.message,
              toolCalls,
              status: "error",
              error: event.message,
            };
            return this.result;
          case "done":
            break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status = "error";
      this.result = { output, toolCalls, status: "error", error: msg };
      return this.result;
    }

    this.status = "done";
    this.result = { output, toolCalls, status: "done" };
    return this.result;
  }
}
