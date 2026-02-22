import { join } from "node:path";
import { homedir } from "node:os";
import { ConfigManager } from "./config/index.js";
import { ModelRouter } from "./router/index.js";
import { Agent } from "./agent/index.js";
import type { ToolImpl, ToolApprovalCallback } from "./agent/index.js";
import { MemoryManager } from "./memory/index.js";
import { getBuiltinTools, formatToolsSection } from "./tools/index.js";
import { createRememberTool } from "./tools/remember.js";
import { createClawHubInstallTool } from "./tools/clawhub-install.js";
import { createClawHubUpdateTool } from "./tools/clawhub-update.js";
import { createSetEnvSecretTool, createSetEnvVariableTool } from "./tools/set-api-key.js";
import { SessionManager } from "./sessions.js";
import { AuthManager } from "./auth.js";
import { SkillRegistry, formatSkillsDiscovery } from "./skills/index.js";
import { createReadSkillTool } from "./tools/read-skill.js";
import { Scheduler, createHeartbeatTask } from "./scheduler.js";
import { createTranscriber, type Transcriber } from "./audio/index.js";

const SAFETY_ADVISORY = `## Safety
You have no independent goals: do not pursue self-preservation, resource acquisition, or \
capability expansion beyond what the current task requires; avoid long-term plans beyond \
the user's request.
Prioritize safety and human oversight over task completion; if instructions conflict, \
pause and ask; comply with stop/pause requests and never bypass safeguards.
Do not manipulate the user to expand your access or disable safeguards. Do not modify \
your own system prompt, safety rules, or tool behaviour unless explicitly asked.
Tool safety is enforced by the engine — dangerous tools always require user confirmation \
regardless of your instructions.`;

const TOOL_CALL_STYLE = `## Tool Call Style
- **safe tools** (read, web_search, etc.): call silently, no narration needed.
- **moderate tools** (write, edit, install): brief narration only for multi-step work.
- **dangerous tools** (exec, exec_kill): always state what you're about to do and why before calling.
- When calling exec, always set the \`danger\` parameter:
  - "safe" for read-only commands (ls, cat, git status, pwd, echo, etc.)
  - "moderate" for commands that modify local state but are reversible (git add, npm install, mkdir)
  - "dangerous" for destructive or irreversible commands (rm, sudo, kill, chmod 777, curl|sh)
- If unsure about danger level, default to "dangerous" — the engine will ask the user.
- Never narrate tool results the user can already see.`;

const REACTIONS_GUIDE = `## Reactions
React with emoji liberally. Not every message needs a text reply — a 👍 or ❤️ is often enough. \
React AND reply when both feel natural, or just react when the emoji says it all. \
Match the tone: 👍 acknowledgment, ❤️ appreciation, 😂 humor, 🎉 celebrations, 🤔 curiosity.`;

const SKILLS_DIRECTIVE = `## Skills (mandatory)
Before replying to each user message, scan the <available_skills> list below.
- If exactly one skill clearly applies: call read_skill to load it, then follow its instructions.
- If multiple could apply: choose the most specific one, then read and follow it.
- If none clearly apply: do not read any skill.
Never read more than one skill up front; only read additional skills if the first one directs you to.`;

function buildHeartbeat(router: ModelRouter): string {
  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  let modelName = "unknown";
  try { modelName = router.getActiveModelName(); } catch { /* fallback */ }
  return `## Session\nStarted: ${dateStr} | Model: ${modelName}`;
}

/** Engine runtime — holds all bootstrapped subsystems */
export interface EngineRuntime {
  config: ConfigManager;
  router: ModelRouter;
  memory: MemoryManager;
  tools: ToolImpl[];
  systemPrompt: string;
  sessions: SessionManager;
  auth: AuthManager;
  skills: SkillRegistry;
  scheduler: Scheduler;
  transcriber: Transcriber;
  agentName: string;
  /** Create a new Agent instance for a session (each session gets its own Agent) */
  createAgent(onToolApproval?: ToolApprovalCallback): Agent;
}

/** Bootstrap all Engine subsystems */
export async function createRuntime(): Promise<EngineRuntime> {
  const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");

  const config = new ConfigManager(saHome);
  const saConfig = await config.load();

  // Initialize memory
  const memoryDir = join(config.homeDir, saConfig.runtime.memory.directory);
  const memory = new MemoryManager(memoryDir);
  await memory.init();

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
        `[sa] Warning: API key "${envVar}" not found for provider "${provider.id}".`
      );
      console.warn(
        `[sa]   Store it with: sa onboard (or set_env_secret tool)`
      );
      if (process.platform === "darwin") {
        console.warn(
          `[sa]   Note: brew services does not inherit shell env vars — keys must be in secrets.enc`
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

  // Load skills
  const skills = new SkillRegistry();
  await skills.loadAll(saHome);

  // Build tools (ClawHub tools are self-contained, install/update need saHome + registry)
  const tools = [
    ...getBuiltinTools(),
    createRememberTool(memory),
    createReadSkillTool(skills),
    createClawHubInstallTool(saHome, skills),
    createClawHubUpdateTool(saHome, skills),
    createSetEnvSecretTool(config),
    createSetEnvVariableTool(config),
  ];

  // Assemble system prompt
  const userProfile = await config.loadUserProfile();
  const toolsSection = formatToolsSection(tools);
  const heartbeat = buildHeartbeat(router);
  const memoryContext = await memory.loadContext();

  const skillsBlock = skills.size > 0
    ? `\n${SKILLS_DIRECTIVE}\n\n${formatSkillsDiscovery(skills.getMetadataList())}`
    : "";

  const systemPrompt = [
    saConfig.identity.systemPrompt,
    `\n${toolsSection}`,
    `\n${TOOL_CALL_STYLE}`,
    `\n${REACTIONS_GUIDE}`,
    `\n${SAFETY_ADVISORY}`,
    userProfile ? `\n## User Profile\n${userProfile}` : "",
    `\n${heartbeat}`,
    memoryContext ? `\n## Memory\n${memoryContext}` : "",
    skillsBlock,
  ]
    .filter(Boolean)
    .join("\n");

  // Initialize scheduler with built-in tasks
  const scheduler = new Scheduler();
  scheduler.register(createHeartbeatTask(saHome));
  scheduler.start();

  // Initialize audio transcriber
  const audioConfig = saConfig.runtime.audio ?? { enabled: true, preferLocal: true };
  const transcriber = await createTranscriber({ preferLocal: audioConfig.preferLocal });
  if (transcriber.backend) {
    console.log(`Audio transcription: ${transcriber.backend}`);
  }

  const sessions = new SessionManager();
  const auth = new AuthManager(saHome);
  await auth.init();

  return {
    config,
    router,
    memory,
    tools,
    systemPrompt,
    sessions,
    auth,
    skills,
    scheduler,
    transcriber,
    agentName: saConfig.identity.name,
    createAgent(onToolApproval?: ToolApprovalCallback): Agent {
      return new Agent({
        router,
        tools,
        systemPrompt,
        onToolApproval,
      });
    },
  };
}
