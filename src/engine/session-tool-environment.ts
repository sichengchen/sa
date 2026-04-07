import type { ToolImpl } from "./agent/types.js";
import type { ModelRouter } from "./router/index.js";
import { Orchestrator } from "./agent/orchestrator.js";
import { SubAgent } from "./agent/sub-agent.js";
import { CheckpointManager, checkpointWorkdirForArgs } from "./checkpoints.js";
import { SubdirectoryContextTracker } from "./context-files.js";
import { createDelegateStatusTool } from "./tools/delegate-status.js";
import { createDelegateTool } from "./tools/delegate.js";

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
  return {
    ...tool,
    execute,
  };
}

export function createSessionToolEnvironment(
  options: SessionToolEnvironmentOptions,
): SessionToolEnvironment {
  const workingDir = options.workingDir ?? process.env.TERMINAL_CWD ?? process.cwd();
  const hintTracker = new SubdirectoryContextTracker(workingDir, options.maxContextHintChars);
  const checkpointManager = options.checkpointManager;

  const wrapTool = (tool: ToolImpl) => cloneTool(tool, async (args) => {
    const checkpointDir = checkpointManager
      ? checkpointWorkdirForArgs(tool.name, args, workingDir)
      : null;

    if (checkpointManager && checkpointDir) {
      await checkpointManager.ensureCheckpoint(checkpointDir, `before ${tool.name}`);
    }

    const result = await tool.execute(args);
    if (result.isError) {
      return result;
    }

    const hint = await hintTracker.inspectToolCall(tool.name, args);
    if (!hint) {
      return result;
    }

    return {
      ...result,
      content: `${result.content}${hint}`,
    };
  });

  const hasDelegation = Boolean(options.delegation) && options.baseTools.some((tool) => tool.name === "delegate" || tool.name === "delegate_status");
  const nonDelegationBaseTools = hasDelegation
    ? options.baseTools.filter((tool) => tool.name !== "delegate" && tool.name !== "delegate_status")
    : options.baseTools;
  const wrappedTools = nonDelegationBaseTools.map(wrapTool);

  let orchestrator: Orchestrator | undefined;
  if (options.delegation && hasDelegation) {
    const createSessionSubAgent = (subAgentOptions: ConstructorParameters<typeof SubAgent>[2]) => {
      const subAgentEnvironment = createSessionToolEnvironment({
        baseTools: nonDelegationBaseTools,
        workingDir,
        checkpointManager,
        maxContextHintChars: options.maxContextHintChars,
      });
      subAgentEnvironment.newTurn();
      return new SubAgent(options.delegation!.router, subAgentEnvironment.tools, {
        ...subAgentOptions,
        memoryWrite: subAgentOptions.memoryWrite ?? options.delegation!.memoryWriteDefault,
        systemPrompt: [
          "You are a focused sub-agent executing a specific delegated task.",
          `Workspace path: ${workingDir}`,
          "You have an isolated tool environment and should only return the concrete result, notable findings, and touched files.",
        ].join("\n"),
      });
    };

    orchestrator = new Orchestrator(options.delegation.router, wrappedTools, {
      maxConcurrent: options.delegation.maxConcurrent,
      maxSubAgentsPerTurn: options.delegation.maxSubAgentsPerTurn,
      resultRetentionMs: options.delegation.resultRetentionMs,
      defaultTimeoutMs: options.delegation.defaultTimeoutMs,
      createSubAgent: createSessionSubAgent,
    });
    const sessionOrchestrator = orchestrator;

    if (options.baseTools.some((tool) => tool.name === "delegate")) {
      wrappedTools.push(createDelegateTool({
        router: options.delegation.router,
        tools: wrappedTools,
        defaultTimeoutMs: options.delegation.defaultTimeoutMs,
        memoryWriteDefault: options.delegation.memoryWriteDefault,
        getOrchestrator: () => sessionOrchestrator,
        createSubAgent: createSessionSubAgent,
      }));
    }

    if (options.baseTools.some((tool) => tool.name === "delegate_status")) {
      wrappedTools.push(createDelegateStatusTool({
        getOrchestrator: () => sessionOrchestrator,
      }));
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
