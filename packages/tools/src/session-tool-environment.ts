import type { ToolImpl } from "@aria/agent";
import type { ModelRouter } from "@aria/gateway/router";
import { Orchestrator } from "@aria/agent/orchestrator";
import { SubAgent } from "@aria/agent/sub-agent";
import { CheckpointManager, checkpointWorkdirForArgs } from "@aria/server/checkpoints";
import { SubdirectoryContextTracker } from "@aria/prompt/context-files";
import {
  createDefaultAriaSessionEnv,
  createDeferredAriaSessionEnv,
  createHarnessTools,
  createLegacyExecTool,
  type AriaHarnessHost,
} from "@aria/harness";
import { createDelegateStatusTool } from "./delegate-status.js";
import { createDelegateTool } from "./delegate.js";

export interface SessionToolEnvironment {
  tools: ToolImpl[];
  hintTracker: SubdirectoryContextTracker;
  checkpointManager?: CheckpointManager;
  orchestrator?: Orchestrator;
  workingDir: string;
  projectRoot?: string;
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
  harnessBuiltins?: boolean;
  harnessHost?: AriaHarnessHost;
  projectRoot?: string | null;
}

function cloneTool(tool: ToolImpl, execute: ToolImpl["execute"]): ToolImpl {
  return { ...tool, execute };
}

export function createSessionToolEnvironment(
  options: SessionToolEnvironmentOptions,
): SessionToolEnvironment {
  const workingDir = options.workingDir ?? process.env.TERMINAL_CWD ?? process.cwd();
  const projectRoot = options.projectRoot ?? undefined;
  const hintTracker = new SubdirectoryContextTracker(workingDir, options.maxContextHintChars);
  const checkpointManager = options.checkpointManager;
  const harnessTools = options.harnessBuiltins
    ? (() => {
        const harnessEnv = createDeferredAriaSessionEnv(
          "default",
          projectRoot ? "/workspace" : workingDir,
          () =>
            createDefaultAriaSessionEnv({
              cwd: workingDir,
              projectRoot,
              host: options.harnessHost,
            }),
        );
        return [...createHarnessTools(harnessEnv), createLegacyExecTool(harnessEnv)];
      })()
    : [];
  const harnessToolMap = new Map(harnessTools.map((tool) => [tool.name, tool]));
  const baseTools = [
    ...options.baseTools.map((tool) => harnessToolMap.get(tool.name) ?? tool),
    ...harnessTools.filter(
      (tool) => !options.baseTools.some((baseTool) => baseTool.name === tool.name),
    ),
  ];

  const wrapTool = (tool: ToolImpl) =>
    cloneTool(tool, async (args) => {
      const checkpointDir = checkpointManager
        ? checkpointWorkdirForArgs(tool.name, args, workingDir)
        : null;
      if (checkpointManager && checkpointDir)
        await checkpointManager.ensureCheckpoint(checkpointDir, `before ${tool.name}`);
      const result = await tool.execute(args);
      if (result.isError) return result;
      const hint = await hintTracker.inspectToolCall(tool.name, args);
      return hint ? { ...result, content: `${result.content}${hint}` } : result;
    });

  const hasDelegation =
    Boolean(options.delegation) &&
    baseTools.some((tool) => tool.name === "delegate" || tool.name === "delegate_status");
  const nonDelegationBaseTools = hasDelegation
    ? baseTools.filter((tool) => tool.name !== "delegate" && tool.name !== "delegate_status")
    : baseTools;
  const wrappedTools = nonDelegationBaseTools.map(wrapTool);

  let orchestrator: Orchestrator | undefined;
  const delegation = options.delegation;
  if (delegation && hasDelegation) {
    const createSessionSubAgent = (subAgentOptions: ConstructorParameters<typeof SubAgent>[2]) => {
      const subAgentEnvironment = createSessionToolEnvironment({
        baseTools: nonDelegationBaseTools,
        workingDir,
        projectRoot,
        checkpointManager,
        maxContextHintChars: options.maxContextHintChars,
      });
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
    if (baseTools.some((tool) => tool.name === "delegate")) {
      wrappedTools.push(
        createDelegateTool({
          router: delegation.router,
          tools: wrappedTools,
          defaultTimeoutMs: delegation.defaultTimeoutMs,
          memoryWriteDefault: delegation.memoryWriteDefault,
          getOrchestrator: () => sessionOrchestrator,
          createSubAgent: createSessionSubAgent,
        }),
      );
    }
    if (baseTools.some((tool) => tool.name === "delegate_status")) {
      wrappedTools.push(createDelegateStatusTool({ getOrchestrator: () => sessionOrchestrator }));
    }
  }

  return {
    tools: wrappedTools,
    hintTracker,
    checkpointManager,
    orchestrator,
    workingDir,
    projectRoot,
    newTurn() {
      checkpointManager?.newTurn();
      orchestrator?.resetTurnCounter();
    },
  };
}
