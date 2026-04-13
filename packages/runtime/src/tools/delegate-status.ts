/**
 * `delegate_status` tool — check status of background sub-agents.
 */

import { Type } from "@sinclair/typebox";
import type { ToolImpl } from "../agent/types.js";
import type { Orchestrator } from "../agent/orchestrator.js";

export interface DelegateStatusDeps {
  /** Get the orchestrator for the current session (may not exist yet) */
  getOrchestrator: () => Orchestrator | undefined;
}

export function createDelegateStatusTool(deps: DelegateStatusDeps): ToolImpl {
  return {
    name: "delegate_status",
    description:
      "Check status of background sub-agents or get their results. Omit id to list all sub-agents for this session.",
    dangerLevel: "safe",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Specific sub-agent ID (omit to list all)" })),
    }),
    async execute(args: Record<string, unknown>) {
      const orchestrator = deps.getOrchestrator();
      if (!orchestrator) {
        return { content: "No background sub-agents have been spawned." };
      }

      const id = args.id as string | undefined;

      if (id) {
        const status = orchestrator.getStatus(id);
        if (!status) {
          return { content: `Sub-agent not found: ${id}`, isError: true };
        }
        return { content: JSON.stringify(status, null, 2) };
      }

      // List all
      const statuses = orchestrator.list();
      if (statuses.length === 0) {
        return { content: "No background sub-agents." };
      }

      const lines = statuses.map((s) => {
        const elapsed = s.completedAt
          ? `${Math.round((s.completedAt - s.startedAt) / 1000)}s`
          : `${Math.round((Date.now() - s.startedAt) / 1000)}s`;
        const summary =
          s.status === "done" && s.result
            ? `: ${s.result.slice(0, 100)}`
            : s.error
              ? `: ${s.error}`
              : "";
        return `- [${s.status}] ${s.id} (${elapsed})${summary}`;
      });

      return { content: lines.join("\n") };
    },
  };
}
