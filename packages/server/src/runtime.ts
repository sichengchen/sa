import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentEvent, AskUserCallback, ToolApprovalCallback, ToolImpl } from "@aria/agent";
import type { Message } from "@mariozechner/pi-ai";
import { Orchestrator } from "@aria/agent/orchestrator";
import { AuditLogger } from "@aria/audit";
import {
  AutomationRegistry,
  Scheduler,
  createHeartbeatTask,
  type AutomationAgentFactory,
} from "@aria/automation";
import { AuthManager } from "@aria/gateway/auth";
import { HandoffService, HandoffStore } from "@aria/handoff";
import {
  createAriaHarnessContext,
  type AriaHarnessHost,
  type AriaHarnessSession,
  type HarnessSessionData,
} from "@aria/harness";
import { ModelRouter } from "@aria/gateway/router";
import type { RuntimeBackendAdapter } from "@aria/jobs/runtime-backend";
import { MemoryManager } from "@aria/memory";
import { SkillRegistry } from "@aria/memory/skills";
import { SecurityModeManager } from "@aria/policy";
import { toolIntentRequiresApproval, type ToolIntent } from "@aria/policy";
import { PromptEngine } from "@aria/prompt";
import { OperationalStore } from "@aria/persistence";
import { ProjectsEngineRepository, ProjectsEngineStore } from "@aria/work";
import {
  askUserTool,
  createDelegateStatusTool,
  createDelegateTool,
  createMemoryDeleteTool,
  createMemoryReadTool,
  createMemorySearchTool,
  createMemoryWriteTool,
  createNotifyTool,
  createSessionTitleTool,
  createReadSkillTool,
  createSetEnvSecretTool,
  createSetEnvVariableTool,
  createSkillManageTool,
  createWebFetchTool,
  createSessionToolEnvironment,
  getBuiltinTools,
} from "@aria/tools";
import { MCPManager } from "./mcp.js";
import { createTranscriber, type Transcriber } from "./audio.js";
import { CLI_NAME, getRuntimeHome } from "./brand.js";
import { CheckpointManager } from "./checkpoints.js";
import { ConfigManager, DEFAULT_HEARTBEAT_MD } from "./config.js";
import { createProjectsControlTool } from "./projects-control-tool.js";
import { SessionArchiveManager } from "./session-archive.js";
import { SessionManager } from "./sessions.js";

export interface RuntimeAgentSession {
  readonly isRunning: boolean;
  abort(): boolean;
  chat(userText: string): AsyncGenerator<AgentEvent>;
  getMessages(): readonly Message[];
  hydrateHistory(messages: readonly Message[]): void;
}

export interface EngineRuntime {
  config: ConfigManager;
  router: ModelRouter;
  memory: MemoryManager;
  store: OperationalStore;
  archive: SessionArchiveManager;
  checkpoints: CheckpointManager;
  mcp: MCPManager;
  tools: ToolImpl[];
  promptEngine: PromptEngine;
  systemPrompt: string;
  sessions: SessionManager;
  auth: AuthManager;
  skills: SkillRegistry;
  scheduler: Scheduler;
  automationAgentFactory?: AutomationAgentFactory;
  transcriber: Transcriber;
  audit: AuditLogger;
  securityMode: SecurityModeManager;
  projects?: ProjectsEngineRepository;
  handoffs?: HandoffService;
  agentName: string;
  mainSessionId: string;
  createAgent(
    onToolApproval?: ToolApprovalCallback,
    modelOverride?: string,
    allowedTools?: string[],
    onAskUser?: AskUserCallback,
  ): RuntimeAgentSession;
  refreshSystemPrompt(): Promise<string>;
  close(): Promise<void>;
}

export async function createRuntime(): Promise<EngineRuntime> {
  const runtimeHome = getRuntimeHome();

  const config = new ConfigManager(runtimeHome);
  const ariaConfig = await config.load();

  const memoryDir = join(config.homeDir, ariaConfig.runtime.memory.directory);
  const memory = new MemoryManager(memoryDir);
  await memory.init();

  const archive = new SessionArchiveManager(config.homeDir);
  await archive.init();
  const store = new OperationalStore(config.homeDir);
  await store.init();
  const projectsStore = new ProjectsEngineStore(join(config.homeDir, "aria.db"));
  await projectsStore.init();
  const projects = new ProjectsEngineRepository(projectsStore);
  const handoffStore = new HandoffStore(join(config.homeDir, "aria.db"));
  await handoffStore.init();
  const handoffs = new HandoffService(handoffStore);

  const checkpoints = new CheckpointManager(config.homeDir, ariaConfig.runtime.checkpoints);
  const mcp = new MCPManager(
    ariaConfig.runtime.mcp?.servers,
    process.env.TERMINAL_CWD ?? process.cwd(),
    store,
  );
  await mcp.init();

  const searchConfig = ariaConfig.runtime.memory.search;
  if (searchConfig) {
    memory.setSearchWeights({
      vectorWeight: searchConfig.vectorWeight,
      textWeight: searchConfig.textWeight,
      temporalDecay: searchConfig.temporalDecay,
    });
  }

  if (ariaConfig.runtime.env) {
    for (const [envVar, value] of Object.entries(ariaConfig.runtime.env)) {
      if (!process.env[envVar] && value) {
        process.env[envVar] = value;
      }
    }
  }

  const secrets = await config.loadSecrets();
  if (secrets?.apiKeys) {
    for (const [envVar, value] of Object.entries(secrets.apiKeys)) {
      if (!process.env[envVar] && value) {
        process.env[envVar] = value;
      }
    }
  }

  for (const provider of ariaConfig.providers) {
    const envVar = provider.apiKeyEnvVar;
    if (!process.env[envVar] && !secrets?.apiKeys[envVar]) {
      console.warn(`[aria] Warning: API key "${envVar}" not found for provider "${provider.id}".`);
      console.warn(`[aria]   Store it with: ${CLI_NAME} onboard (or set_env_secret tool)`);
      if (process.platform === "darwin") {
        console.warn(
          "[aria]   Note: launchd services do not inherit shell env vars - keys must be in secrets.enc",
        );
      }
    }
  }

  const baseConfigFile = config.getConfigFile();
  const router = ModelRouter.fromConfig(
    {
      providers: ariaConfig.providers,
      models: ariaConfig.models,
      defaultModel: ariaConfig.defaultModel,
    },
    secrets,
    async (state) => {
      await config.saveConfig({
        ...baseConfigFile,
        providers: state.providers,
        models: state.models,
        defaultModel: state.defaultModel,
        runtime: { ...baseConfigFile.runtime, activeModel: state.activeModel },
      });
    },
    {
      modelTiers: ariaConfig.runtime.modelTiers,
      taskTierOverrides: ariaConfig.runtime.taskTierOverrides,
      modelAliases: ariaConfig.runtime.modelAliases,
    },
  );

  if (router.hasEmbedding()) {
    const embCfg = router.getEmbeddingConfig()!;
    const embProvider = router.getProvider(embCfg.provider);
    try {
      await memory.setEmbedding({
        embed: (texts) => router.embed(texts),
        provider: embProvider.type,
        model: embCfg.model,
      });
    } catch (error) {
      console.warn(
        "[aria] Failed to initialize embeddings:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const skills = new SkillRegistry();
  await skills.loadAll(runtimeHome);
  let runtime: EngineRuntime;

  const tools: ToolImpl[] = [
    ...getBuiltinTools(),
    createWebFetchTool(ariaConfig.runtime.urlPolicy),
    createMemoryWriteTool(memory),
    createMemorySearchTool(memory),
    createMemoryReadTool(memory),
    createMemoryDeleteTool(memory),
    createReadSkillTool(skills),
    createSkillManageTool({
      homeDir: config.homeDir,
      registry: skills,
      onMutate: async () => {
        if (runtime) {
          await runtime.refreshSystemPrompt();
        }
      },
    }),
    createSetEnvSecretTool(config),
    createSetEnvVariableTool(config),
    createNotifyTool(secrets),
    createSessionTitleTool(),
    createProjectsControlTool({
      getRepository: () => projects,
      runDispatch: async (repository, dispatchId) => {
        const { runDispatchExecution } = await import("@aria/jobs/dispatch-runner");
        return runDispatchExecution(runtime, repository, dispatchId, {
          backendRegistry: (
            runtime as EngineRuntime & {
              runtimeBackendRegistry?: Map<string, RuntimeBackendAdapter>;
            }
          ).runtimeBackendRegistry,
        });
      },
    }),
    askUserTool,
    ...mcp.getTools(),
  ];

  const orchestrator = new Orchestrator(router, tools, {
    maxConcurrent: ariaConfig.runtime.orchestration?.maxConcurrent,
    maxSubAgentsPerTurn: ariaConfig.runtime.orchestration?.maxSubAgentsPerTurn,
    resultRetentionMs: ariaConfig.runtime.orchestration?.resultRetentionMs,
    defaultTimeoutMs: ariaConfig.runtime.orchestration?.defaultTimeoutMs,
  });

  tools.push(
    createDelegateTool({
      router,
      tools,
      defaultTimeoutMs: ariaConfig.runtime.orchestration?.defaultTimeoutMs,
      memoryWriteDefault: ariaConfig.runtime.orchestration?.memoryWriteDefault,
      getOrchestrator: () => orchestrator,
    }),
  );

  tools.push(
    createDelegateStatusTool({
      getOrchestrator: () => orchestrator,
    }),
  );

  const promptEngine = new PromptEngine({
    config,
    router,
    memory,
    store,
    skills,
    tools,
  });
  let systemPrompt = await promptEngine.buildBasePrompt();

  const audioConfig = ariaConfig.runtime.audio ?? {
    enabled: true,
    preferLocal: true,
  };
  const transcriber = await createTranscriber({
    preferLocal: audioConfig.preferLocal,
  });
  if (transcriber.backend) {
    console.log(`Audio transcription: ${transcriber.backend}`);
  }

  const sessions = new SessionManager(store);
  const auth = new AuthManager(runtimeHome, ariaConfig.runtime.security, store);
  await auth.init();
  const audit = new AuditLogger(runtimeHome);
  const securityMode = new SecurityModeManager(ariaConfig.runtime.security);

  function createRuntimeHarnessHost(
    sessionId: string,
  ): AriaHarnessHost & { rememberApprovedIntent(intent: ToolIntent): void } {
    const preapprovedToolIntents = new Set<string>();
    const approvalKey = (intent: ToolIntent) =>
      JSON.stringify({
        toolName: intent.toolName,
        environment: intent.environment,
        filesystemEffect: intent.filesystemEffect,
        network: intent.network,
        command: intent.command,
      });
    const host: AriaHarnessHost & { rememberApprovedIntent(intent: ToolIntent): void } = {
      rememberApprovedIntent(intent) {
        if (toolIntentRequiresApproval(intent)) {
          preapprovedToolIntents.add(approvalKey(intent));
        }
      },
      resolveModel(input) {
        return router.getModel(input.model);
      },
      async requestToolDecision(intent) {
        if (preapprovedToolIntents.delete(approvalKey(intent))) {
          return { status: "allow" };
        }
        if (toolIntentRequiresApproval(intent)) {
          return { status: "escalate", reason: "Runtime approval required for tool intent" };
        }
        return { status: "allow" };
      },
      async recordAudit(event) {
        audit.log({
          session: event.sessionId ?? sessionId,
          connector: "engine",
          event: "tool_call",
          run: event.runId,
          tool: event.toolName,
          summary: event.message,
          environment: event.intent?.environment,
          command: event.intent?.command,
          cwd: event.intent?.cwd,
          leases: event.intent?.leases,
        });
      },
      async appendRunEvent() {},
      async loadHarnessSession(id) {
        const cached = store.getPromptCache(`harness-session:${id}`);
        return cached ? (JSON.parse(cached.content) as HarnessSessionData) : null;
      },
      async saveHarnessSession(id, data) {
        store.putPromptCache({
          cacheKey: `harness-session:${id}`,
          scope: "harness_session",
          content: JSON.stringify(data),
          metadata: { sessionId: id },
          updatedAt: data.updatedAt,
        });
      },
      async resolveSecrets() {
        return {};
      },
    };
    return host;
  }

  function getRuntimeToolIntent(toolName: string, args: Record<string, unknown>): ToolIntent {
    return {
      toolName,
      environment: "default",
      filesystemEffect:
        toolName === "write" || toolName === "edit" || toolName === "exec" || toolName === "bash"
          ? "virtual"
          : "none",
      network: toolName === "web_fetch" || toolName === "web_search" ? "allowlist" : "none",
      leases: Array.isArray(args.leases) ? args.leases.map(String) : [],
      command: typeof args.command === "string" ? args.command : undefined,
      cwd:
        typeof args.cwd === "string"
          ? args.cwd
          : typeof args.workdir === "string"
            ? args.workdir
            : undefined,
    };
  }

  function createHarnessRuntimeAgent(options: {
    sessionId: string;
    tools: ToolImpl[];
    getSystemPrompt: () => string;
    modelOverride?: string;
    onToolApproval?: ToolApprovalCallback;
    onAskUser?: AskUserCallback;
  }): RuntimeAgentSession {
    let hydratedMessages: readonly Message[] = [];
    let harnessSession: AriaHarnessSession | null = null;
    const harnessHost = createRuntimeHarnessHost(options.sessionId);
    const toolEnvironment = createSessionToolEnvironment({
      baseTools: options.tools,
      workingDir: process.env.TERMINAL_CWD ?? process.cwd(),
      harnessBuiltins: true,
      harnessHost,
    });
    const harnessSessionPromise = (async () => {
      const ctx = createAriaHarnessContext({
        id: options.sessionId,
        host: harnessHost,
        cwd: toolEnvironment.workingDir,
        projectRoot: toolEnvironment.projectRoot,
      });
      const agent = await ctx.init({
        id: options.sessionId,
        model: options.modelOverride,
        environment: "default",
      });
      const session = await agent.session(options.sessionId);
      if (hydratedMessages.length > 0) {
        session.hydrateHistory(hydratedMessages);
      }
      harnessSession = session;
      return session;
    })();

    return {
      get isRunning() {
        return harnessSession?.isRunning ?? false;
      },
      abort() {
        return harnessSession?.abort() ?? false;
      },
      async *chat(userText: string) {
        const session = await harnessSessionPromise;
        toolEnvironment.newTurn();
        yield* session.chat(userText, {
          router,
          tools: toolEnvironment.tools,
          getSystemPrompt: options.getSystemPrompt,
          modelOverride: options.modelOverride,
          onToolApproval: options.onToolApproval
            ? async (toolName, toolCallId, args) => {
                const approved = await options.onToolApproval!(toolName, toolCallId, args);
                if (approved) {
                  harnessHost.rememberApprovedIntent(getRuntimeToolIntent(toolName, args));
                }
                return approved;
              }
            : undefined,
          onAskUser: options.onAskUser,
        });
      },
      getMessages() {
        return harnessSession?.getMessages() ?? hydratedMessages;
      },
      hydrateHistory(messages: readonly Message[]) {
        hydratedMessages = Array.from(messages);
        harnessSession?.hydrateHistory(messages);
      },
    };
  }

  let mainSession = sessions.getLatest("main");
  if (!mainSession) {
    mainSession = sessions.create("main", "engine");
  }

  const mainAgent = createHarnessRuntimeAgent({
    sessionId: mainSession.id,
    tools,
    getSystemPrompt: () => systemPrompt,
  });
  const notifyTool = tools.find((tool) => tool.name === "notify");

  const heartbeatMdPath = join(
    runtimeHome,
    ariaConfig.runtime.heartbeat?.checklistPath ?? "HEARTBEAT.md",
  );
  if (!existsSync(heartbeatMdPath)) {
    await writeFile(heartbeatMdPath, DEFAULT_HEARTBEAT_MD);
  }

  const scheduler = new Scheduler();
  scheduler.register(
    createHeartbeatTask(
      {
        runtimeHome,
        mainAgent,
        notify: notifyTool
          ? async (message: string) => {
              const result = await notifyTool.execute({ message });
              if (result.isError) {
                console.warn("[heartbeat] Notify failed:", result.content);
              }
            }
          : undefined,
      },
      null,
      ariaConfig.runtime.heartbeat,
    ),
  );

  const cronTasks = ariaConfig.runtime.automation?.cronTasks ?? [];
  const webhookTasks = ariaConfig.runtime.automation?.webhookTasks ?? [];

  runtime = {
    config,
    router,
    memory,
    store,
    archive,
    checkpoints,
    mcp,
    tools,
    promptEngine,
    systemPrompt,
    sessions,
    auth,
    skills,
    scheduler,
    transcriber,
    audit,
    securityMode,
    projects,
    handoffs,
    agentName: ariaConfig.identity.name,
    mainSessionId: mainSession.id,
    async refreshSystemPrompt(): Promise<string> {
      systemPrompt = await promptEngine.buildBasePrompt(true);
      runtime.systemPrompt = systemPrompt;
      return systemPrompt;
    },
    async close(): Promise<void> {
      scheduler.stop();
      await mcp.close();
      handoffs.close();
      projects.close();
      archive.close();
      store.close();
      memory.close();
      await auth.cleanup();
    },
    createAgent(
      onToolApproval?: ToolApprovalCallback,
      modelOverride?: string,
      allowedTools?: string[],
      onAskUser?: AskUserCallback,
    ): RuntimeAgentSession {
      const agentTools = allowedTools
        ? tools.filter((tool) => allowedTools.includes(tool.name))
        : tools;
      return createHarnessRuntimeAgent({
        sessionId: `runtime-agent:${crypto.randomUUID()}`,
        tools: agentTools,
        getSystemPrompt: () => runtime.systemPrompt,
        onToolApproval,
        onAskUser,
        modelOverride,
      });
    },
  };

  const automationRegistry = new AutomationRegistry(runtime);
  automationRegistry.restoreFromRuntimeConfig();
  if (cronTasks.length > 0) {
    console.log(`[aria] Restored ${cronTasks.filter((task) => task.enabled).length} cron task(s)`);
  }
  if (webhookTasks.length > 0) {
    console.log(
      `[aria] Restored ${webhookTasks.filter((task) => task.enabled).length} webhook task(s)`,
    );
  }

  scheduler.start();
  return runtime;
}
