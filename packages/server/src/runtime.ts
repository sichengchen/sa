import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Agent,
  type AskUserCallback,
  type ToolApprovalCallback,
  type ToolImpl,
} from "@aria/agent-aria";
import { Orchestrator } from "@aria/agent-aria/orchestrator";
import { AuditLogger } from "@aria/audit";
import { AutomationRegistry, Scheduler, createHeartbeatTask } from "@aria/automation";
import { AuthManager } from "@aria/gateway/auth";
import { ModelRouter } from "@aria/gateway/router";
import { MemoryManager } from "@aria/memory";
import { SkillRegistry } from "@aria/memory/skills";
import { SecurityModeManager } from "@aria/policy";
import { PromptEngine } from "@aria/prompt";
import { OperationalStore } from "@aria/store";
import {
  askUserTool,
  createClaudeCodeTool,
  createCodexTool,
  createDelegateStatusTool,
  createDelegateTool,
  createMemoryDeleteTool,
  createMemoryReadTool,
  createMemorySearchTool,
  createMemoryWriteTool,
  createNotifyTool,
  createReadSkillTool,
  createSetEnvSecretTool,
  createSetEnvVariableTool,
  createSkillManageTool,
  createWebFetchTool,
  getBuiltinTools,
} from "@aria/tools";
import { configureSandbox } from "@aria/tools/exec";
import { MCPManager } from "./mcp.js";
import { createTranscriber, type Transcriber } from "./audio.js";
import { CLI_NAME, getRuntimeHome } from "./brand.js";
import { CheckpointManager } from "./checkpoints.js";
import { ConfigManager, DEFAULT_HEARTBEAT_MD } from "./config.js";
import { SessionArchiveManager } from "./session-archive.js";
import { SessionManager } from "./sessions.js";

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
  transcriber: Transcriber;
  audit: AuditLogger;
  securityMode: SecurityModeManager;
  agentName: string;
  mainSessionId: string;
  createAgent(
    onToolApproval?: ToolApprovalCallback,
    modelOverride?: string,
    allowedTools?: string[],
    onAskUser?: AskUserCallback,
  ): Agent;
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

  tools.push(
    createClaudeCodeTool({
      getSecret: (envVar) => secrets?.apiKeys[envVar],
    }),
  );
  tools.push(
    createCodexTool({
      getSecret: (envVar) => secrets?.apiKeys[envVar],
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

  const execSecurity = ariaConfig.runtime.security?.exec;
  if (execSecurity) {
    configureSandbox({
      fence: execSecurity.fence ?? [],
      deny: execSecurity.alwaysDeny ?? [],
    });
  }

  let mainSession = sessions.getLatest("main");
  if (!mainSession) {
    mainSession = sessions.create("main", "engine");
  }

  const mainAgent = new Agent({
    router,
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
    ): Agent {
      const agentTools = allowedTools
        ? tools.filter((tool) => allowedTools.includes(tool.name))
        : tools;
      return new Agent({
        router,
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
