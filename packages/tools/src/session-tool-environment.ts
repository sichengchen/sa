import type { ToolImpl } from "@aria/runtime/agent";
import type { ModelRouter } from "@aria/runtime/router";
import { Orchestrator } from "@aria/agent-aria/orchestrator";
import { SubAgent } from "@aria/agent-aria/sub-agent";
import { CheckpointManager, checkpointWorkdirForArgs } from "@aria/runtime/checkpoints";
import { SubdirectoryContextTracker } from "@aria/prompt/context-files";
import { createDelegateStatusTool } from "./delegate-status.js";
import { createDelegateTool } from "./delegate.js";

export interface SessionToolEnvironment {
  tools: ToolImpl[];
  hintTracker: SubdirectoryContextTracker;
  checkpointManager?: CheckpointManager;
  orchestrator?: Orchestrator;
  workingDir: string;
  newTurn(): void;
}

export interface SessionDelegationOptions {
  router: ModelRouter;
  defaultTimeoutMs?: number;
  memoryWriteDefault?: boolean;
  maxConcurrent?: number;
  maxSubAgentsPerTurn?: number;
  resultRetentionMs?: number;
}

export interface SessionToolEnvironmentOptions {
  baseTools: ToolImpl[];
  workingDir?: string;
  checkpointManager?: CheckpointManager;
  maxContextHintChars?: number;
  delegation?: SessionDelegationOptions;
}

function cloneTool(tool: ToolImpl, execute: ToolImpl["execute"]): ToolImpl {
  return { ...tool, execute };
}

export function createSessionToolEnvironment(options: SessionToolEnvironmentOptions): SessionToolEnvironment {
  const workingDir = options.workingDir ?? process.env.TERMINAL_CWD ?? process.cwd();
  const hintTracker = new SubdirectoryContextTracker(workingDir, options.maxContextHintChars);
  const checkpointManager = options.checkpointManager;

  const wrapTool = (tool: ToolImpl) => cloneTool(tool, async (args) => {
    const checkpointDir = checkpointManager ? checkpointWorkdirForArgs(tool.name, args, workingDir) : null;
    if (checkpointManager && checkpointDir) await checkpointManager.ensureCheckpoint(checkpointDir, `before ${tool.name}`);
    const result = await tool.execute(args);
    if (result.isError) return result;
    const hint = await hintTracker.inspectToolCall(tool.name, args);
    return hint ? { ...result, content: `${result.content}${hint}` } : result;
  });

  const hasDelegation = Boolean(options.delegation) && options.baseTools.some((tool) => tool.name === "delegate" || tool.name === "delegate_status");
  const nonDelegationBaseTools = hasDelegation ? options.baseTools.filter((tool) => tool.name !== "delegate" && tool.name !== "delegate_status") : options.baseTools;
  const wrappedTools = nonDelegationBaseTools.map(wrapTool);

  let orchestrator: Orchestrator | undefined;
  const delegation = options.delegation;
  if (delegation && hasDelegation) {
    const createSessionSubAgent = (subAgentOptions: ConstructorParameters<typeof SubAgent>[2]) => {
      const subAgentEnvironment = createSessionToolEnvironment({ baseTools: nonDelegationBaseTools, workingDir, checkpointManager, maxContextHintChars: options.maxContextHintChars });
      subAgentEnvironment.newTurn();
      return new SubAgent(delegation.router, subAgentEnvironment.tools, {
        ...subAgentOptions,
        memoryWrite: subAgentOptions.memoryWrite ?? delegation.memoryWriteDefault,
        systemPrompt: [
          "You are a focused sub-agent executing a specific delegated task.",
          `Workspace path: ${workingDir}`,
          "You have an isolated tool environment and should only return the concrete result, notable findings, and touched files.",
        ].join("\n"),
      });
    };

    orchestrator = new Orchestrator(delegation.router, wrappedTools, {
      maxConcurrent: delegation.maxConcurrent,
      maxSubAgentsPerTurn: delegation.maxSubAgentsPerTurn,
      resultRetentionMs: delegation.resultRetentionMs,
      defaultTimeoutMs: delegation.defaultTimeoutMs,
      createSubAgent: createSessionSubAgent,
    });
    const sessionOrchestrator = orchestrator;
    if (options.baseTools.some((tool) => tool.name === "delegate")) {
      wrappedTools.push(createDelegateTool({
        router: delegation.router,
        tools: wrappedTools,
        defaultTimeoutMs: delegation.defaultTimeoutMs,
        memoryWriteDefault: delegation.memoryWriteDefault,
        getOrchestrator: () => sessionOrchestrator,
        createSubAgent: createSessionSubAgent,
      }));
    }
    if (options.baseTools.some((tool) => tool.name === "delegate_status")) {
      wrappedTools.push(createDelegateStatusTool({ getOrchestrator: () => sessionOrchestrator }));
    }
  }

  return {
    tools: wrappedTools,
    hintTracker,
    checkpointManager,
    orchestrator,
    workingDir,
    newTurn() {
      checkpointManager?.newTurn();
      orchestrator?.resetTurnCounter();
    },
  };
}
