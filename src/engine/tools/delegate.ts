/**
 * `delegate` tool — spawns a sub-agent (synchronous or background).
 */

import { Type } from "@sinclair/typebox";
import type { ToolImpl } from "../agent/types.js";
import type { ModelRouter } from "../router/index.js";
import type { Orchestrator } from "../agent/orchestrator.js";
import { SubAgent } from "../agent/sub-agent.js";

export interface DelegateToolDeps {
  router: ModelRouter;
  tools: ToolImpl[];
  /** Default timeout in ms (from config, default: 120_000) */
  defaultTimeoutMs?: number;
  /** Whether background sub-agents can write to memory (default: false) */
  memoryWriteDefault?: boolean;
  /** Get the orchestrator for background execution (lazy init) */
  getOrchestrator?: () => Orchestrator;
}

export function createDelegateTool(deps: DelegateToolDeps): ToolImpl {
  return {
    name: "delegate",
    description: "Delegate a task to a sub-agent. By default runs synchronously (blocks until done). Set background=true to spawn in the background and poll with delegate_status. Sub-agents have limited tools (no delegate — no recursion).",
    dangerLevel: "moderate",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "The task instruction for a single sub-agent" })),
      tasks: Type.Optional(Type.Array(
        Type.Object({
          task: Type.String({ description: "Task instruction" }),
          model: Type.Optional(Type.String({ description: "Model override" })),
          tools: Type.Optional(Type.Array(Type.String(), { description: "Tool allowlist" })),
        }),
        { description: "Spawn multiple sub-agents (always background)" },
      )),
      model: Type.Optional(Type.String({ description: "Model override (default: eco tier)" })),
      tools: Type.Optional(Type.Array(Type.String(), { description: "Tool name allowlist (default: all non-delegate tools)" })),
      background: Type.Optional(Type.Boolean({ description: "If true, return handle immediately (use delegate_status to poll)" })),
    }),
    async execute(args: Record<string, unknown>) {
      const singleTask = args.task as string | undefined;
      const multiTasks = args.tasks as Array<{ task: string; model?: string; tools?: string[] }> | undefined;
      const model = args.model as string | undefined;
      const toolsFilter = args.tools as string[] | undefined;
      const background = args.background as boolean | undefined;

      // Multi-spawn mode
      if (multiTasks && multiTasks.length > 0) {
        if (!deps.getOrchestrator) {
          return { content: "Error: background execution not available", isError: true };
        }
        const orchestrator = deps.getOrchestrator();
        const ids: string[] = [];

        for (const t of multiTasks) {
          const id = `subagent:${crypto.randomUUID()}`;
          try {
            orchestrator.spawnBackground({
              id,
              task: t.task,
              modelOverride: t.model ?? model,
              tools: t.tools ?? toolsFilter,
              timeoutMs: deps.defaultTimeoutMs,
              memoryWrite: deps.memoryWriteDefault ?? false,
            });
            ids.push(id);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: `Error spawning sub-agent: ${msg}`, isError: true };
          }
        }

        return {
          content: `Spawned ${ids.length} background sub-agent(s):\n${ids.map((id) => `- ${id}`).join("\n")}\n\nUse delegate_status to check progress.`,
        };
      }

      // Single task
      if (!singleTask) {
        return { content: "Error: task parameter is required", isError: true };
      }

      const subAgentId = `subagent:${crypto.randomUUID()}`;

      // Background mode
      if (background) {
        if (!deps.getOrchestrator) {
          return { content: "Error: background execution not available", isError: true };
        }
        const orchestrator = deps.getOrchestrator();
        try {
          orchestrator.spawnBackground({
            id: subAgentId,
            task: singleTask,
            modelOverride: model,
            tools: toolsFilter,
            timeoutMs: deps.defaultTimeoutMs,
            memoryWrite: deps.memoryWriteDefault ?? false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: `Error spawning sub-agent: ${msg}`, isError: true };
        }

        return {
          content: `Sub-agent spawned in background: ${subAgentId}\nUse delegate_status to check progress.`,
        };
      }

      // Synchronous mode (default)
      const subAgent = new SubAgent(deps.router, deps.tools, {
        id: subAgentId,
        task: singleTask,
        modelOverride: model,
        tools: toolsFilter,
        timeoutMs: deps.defaultTimeoutMs,
      });

      const result = await subAgent.run(singleTask);

      const lines: string[] = [];
      lines.push(`## Sub-agent result (${result.status})`);
      if (result.error) {
        lines.push(`**Error:** ${result.error}`);
      }
      if (result.output) {
        lines.push(result.output);
      }
      if (result.toolCalls.length > 0) {
        lines.push(`\n**Tool calls:** ${result.toolCalls.map((tc) => tc.name).join(", ")}`);
      }

      return {
        content: lines.join("\n"),
        isError: result.status === "error",
      };
    },
  };
}
