import { join } from "node:path";
import { ConfigManager } from "./config/index.js";
import { ModelRouter } from "./router/index.js";
import { Agent } from "./agent/index.js";
import type { ToolImpl, ToolApprovalCallback, AskUserCallback } from "./agent/index.js";
import { MemoryManager } from "./memory/index.js";
import { getBuiltinTools, createWebFetchTool, createDelegateTool, createDelegateStatusTool, createClaudeCodeTool, createCodexTool, askUserTool } from "./tools/index.js";
import { Orchestrator } from "./agent/orchestrator.js";
import { createMemoryWriteTool } from "./tools/memory-write.js";
import { createMemorySearchTool } from "./tools/memory-search.js";
import { createMemoryReadTool } from "./tools/memory-read.js";
import { createMemoryDeleteTool } from "./tools/memory-delete.js";
import { createSetEnvSecretTool, createSetEnvVariableTool } from "./tools/set-api-key.js";
import { createNotifyTool } from "./tools/notify.js";
import { SessionManager } from "./sessions.js";
import { AuthManager } from "./auth.js";
import { SkillRegistry } from "./skills/index.js";
import { createReadSkillTool } from "./tools/read-skill.js";
import { Scheduler, createHeartbeatTask } from "./scheduler.js";
import { DEFAULT_HEARTBEAT_MD, CRON_DEFAULT_TOOLS } from "./config/defaults.js";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createTranscriber, type Transcriber } from "./audio/index.js";
import { AuditLogger } from "./audit.js";
import { SecurityModeManager } from "./security-mode.js";
import { configureSandbox } from "./tools/exec.js";
import { SessionArchiveManager } from "./session-archive.js";
import { CheckpointManager } from "./checkpoints.js";
import { createSkillManageTool } from "./tools/skill-manage.js";
import { MCPManager } from "./mcp.js";
import { registerCronTask } from "./automation.js";
import { OperationalStore } from "./operational-store.js";
import { PromptEngine } from "./prompt-engine.js";
import { CLI_NAME, getRuntimeHome } from "@sa/shared/brand.js";

/** Engine runtime — holds all bootstrapped subsystems */
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
  /** The main session ID (engine-level, not tied to any connector) */
  mainSessionId: string;
  /** Create a new Agent instance for a session (each session gets its own Agent) */
  createAgent(onToolApproval?: ToolApprovalCallback, modelOverride?: string, allowedTools?: string[], onAskUser?: AskUserCallback): Agent;
  /** Rebuild the runtime system prompt from current config, memory, and skills. */
  refreshSystemPrompt(): Promise<string>;
  /** Close long-lived runtime resources. Safe to call multiple times. */
  close(): Promise<void>;
}

/** Bootstrap all Engine subsystems */
export async function createRuntime(): Promise<EngineRuntime> {
  const saHome = getRuntimeHome();

  const config = new ConfigManager(saHome);
  const saConfig = await config.load();

  // Initialize memory
  const memoryDir = join(config.homeDir, saConfig.runtime.memory.directory);
  const memory = new MemoryManager(memoryDir);
  await memory.init();

  const archive = new SessionArchiveManager(config.homeDir);
  await archive.init();
  const store = new OperationalStore(config.homeDir);
  await store.init();

  const checkpoints = new CheckpointManager(config.homeDir, saConfig.runtime.checkpoints);
  const mcp = new MCPManager(saConfig.runtime.mcp?.servers);
  await mcp.init();

  // Apply search weights from config
  const searchConfig = saConfig.runtime.memory.search;
  if (searchConfig) {
    memory.setSearchWeights({
      vectorWeight: searchConfig.vectorWeight,
      textWeight: searchConfig.textWeight,
      temporalDecay: searchConfig.temporalDecay,
    });
  }

  // Inject plain env vars from config.json (env vars take precedence)
  if (saConfig.runtime.env) {
    for (const [envVar, value] of Object.entries(saConfig.runtime.env)) {
      if (!process.env[envVar] && value) {
        process.env[envVar] = value;
      }
    }
  }

  // Inject encrypted secrets into process.env (env vars take precedence, secrets override plain config)
  const secrets = await config.loadSecrets();
  if (secrets?.apiKeys) {
    for (const [envVar, value] of Object.entries(secrets.apiKeys)) {
      if (!process.env[envVar] && value) {
        process.env[envVar] = value;
      }
    }
  }
  // Validate provider API keys — warn early if missing
  for (const provider of saConfig.providers) {
    const envVar = provider.apiKeyEnvVar;
    if (!process.env[envVar] && !secrets?.apiKeys[envVar]) {
      console.warn(
        `[aria] Warning: API key "${envVar}" not found for provider "${provider.id}".`
      );
      console.warn(
        `[aria]   Store it with: ${CLI_NAME} onboard (or set_env_secret tool)`
      );
      if (process.platform === "darwin") {
        console.warn(
          "[aria]   Note: launchd services do not inherit shell env vars — keys must be in secrets.enc"
        );
      }
    }
  }

  const baseConfigFile = config.getConfigFile();
  const router = ModelRouter.fromConfig(
    { providers: saConfig.providers, models: saConfig.models, defaultModel: saConfig.defaultModel },
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
      modelTiers: saConfig.runtime.modelTiers,
      taskTierOverrides: saConfig.runtime.taskTierOverrides,
      modelAliases: saConfig.runtime.modelAliases,
    },
  );

  // Wire embedding config from router to memory manager (if an embedding model is configured)
  if (router.hasEmbedding()) {
    const embCfg = router.getEmbeddingConfig()!;
    const embProvider = router.getProvider(embCfg.provider);
    try {
      await memory.setEmbedding({
        embed: (texts) => router.embed(texts),
        provider: embProvider.type,
        model: embCfg.model,
      });
    } catch (err) {
      console.warn("[aria] Failed to initialize embeddings:", err instanceof Error ? err.message : String(err));
    }
  }

  // Load skills
  const skills = new SkillRegistry();
  await skills.loadAll(saHome);
  let runtime: EngineRuntime;

  // Build tools
  const tools: ToolImpl[] = [
    ...getBuiltinTools(),
    createWebFetchTool(saConfig.runtime.urlPolicy),
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

  // Create shared orchestrator for background sub-agent execution
  const orchestrator = new Orchestrator(router, tools, {
    maxConcurrent: saConfig.runtime.orchestration?.maxConcurrent,
    maxSubAgentsPerTurn: saConfig.runtime.orchestration?.maxSubAgentsPerTurn,
    resultRetentionMs: saConfig.runtime.orchestration?.resultRetentionMs,
    defaultTimeoutMs: saConfig.runtime.orchestration?.defaultTimeoutMs,
  });

  // Add delegate tools (need full tools list — the tool factory captures the reference)
  const delegateTool = createDelegateTool({
    router,
    tools,
    defaultTimeoutMs: saConfig.runtime.orchestration?.defaultTimeoutMs,
    memoryWriteDefault: saConfig.runtime.orchestration?.memoryWriteDefault,
    getOrchestrator: () => orchestrator,
  });
  tools.push(delegateTool);

  const delegateStatusTool = createDelegateStatusTool({
    getOrchestrator: () => orchestrator,
  });
  tools.push(delegateStatusTool);

  // Add native coding agent tools
  tools.push(createClaudeCodeTool({
    getSecret: (envVar) => secrets?.apiKeys[envVar],
  }));
  tools.push(createCodexTool({
    getSecret: (envVar) => secrets?.apiKeys[envVar],
  }));

  const promptEngine = new PromptEngine({
    config,
    router,
    memory,
    store,
    skills,
    tools,
  });
  let systemPrompt = await promptEngine.buildBasePrompt();

  // Initialize audio transcriber
  const audioConfig = saConfig.runtime.audio ?? { enabled: true, preferLocal: true };
  const transcriber = await createTranscriber({ preferLocal: audioConfig.preferLocal });
  if (transcriber.backend) {
    console.log(`Audio transcription: ${transcriber.backend}`);
  }

  const sessions = new SessionManager(store);
  const auth = new AuthManager(saHome, saConfig.runtime.security);
  await auth.init();
  const audit = new AuditLogger(saHome);
  const securityMode = new SecurityModeManager(saConfig.runtime.security);

  // Configure OS sandbox with exec fence paths
  const execSecurity = saConfig.runtime.security?.exec;
  if (execSecurity) {
    configureSandbox({
      fence: execSecurity.fence ?? [],
      deny: execSecurity.alwaysDeny ?? [],
    });
  }

  // Create or resume the main session
  let mainSession = sessions.getLatest("main");
  if (!mainSession) {
    mainSession = sessions.create("main", "engine");
  }

  // Create the main agent (used by heartbeat and engine-level tasks)
  const mainAgent = new Agent({ router, tools, getSystemPrompt: () => systemPrompt });
  const notifyTool = tools.find((t) => t.name === "notify");

  // Ensure HEARTBEAT.md exists
  const heartbeatMdPath = join(saHome, saConfig.runtime.heartbeat?.checklistPath ?? "HEARTBEAT.md");
  if (!existsSync(heartbeatMdPath)) {
    await writeFile(heartbeatMdPath, DEFAULT_HEARTBEAT_MD);
  }

  // Initialize scheduler with agent-based heartbeat
  const scheduler = new Scheduler();
  scheduler.register(createHeartbeatTask({
    saHome,
    mainAgent,
    notify: notifyTool
      ? async (message: string) => {
        const result = await notifyTool.execute({ message });
        if (result.isError) {
          console.warn("[heartbeat] Notify failed:", result.content);
        }
      }
      : undefined,
  }, null, saConfig.runtime.heartbeat));

  // Restore persisted cron tasks from config
  const cronTasks = saConfig.runtime.automation?.cronTasks ?? [];
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
    agentName: saConfig.identity.name,
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
    createAgent(onToolApproval?: ToolApprovalCallback, modelOverride?: string, allowedTools?: string[], onAskUser?: AskUserCallback): Agent {
      const agentTools = allowedTools
        ? tools.filter((t) => allowedTools.includes(t.name))
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
  for (const task of cronTasks) {
    if (!task.enabled) continue;
    registerCronTask(runtime, task);
  }
  if (cronTasks.length > 0) {
    console.log(`[aria] Restored ${cronTasks.filter((t) => t.enabled).length} cron task(s)`);
  }

  scheduler.start();
  return runtime;
}
