import type { ProviderConfig, ModelConfig } from "../router/types.js";
import type { ModelTier, TaskType } from "../router/task-types.js";
import type { ToolApprovalMode, ConnectorType } from "@aria/shared/types.js";

export interface Identity {
  name: string;
  personality: string;
  systemPrompt: string;
}

/** Per-connector tool approval configuration */
export type ToolApprovalConfig = Partial<Record<ConnectorType, ToolApprovalMode>>;

/** Tool reporting verbosity levels */
export type ToolVerbosity = "silent" | "minimal" | "verbose";

/** Per-tool override for danger level and reporting */
export interface ToolOverride {
  dangerLevel?: "safe" | "moderate" | "dangerous";
  report?: "always" | "never" | "on_error";
}

/** Tool policy configuration */
export interface ToolPolicyConfig {
  /** Per-connector reporting verbosity */
  verbosity?: Partial<Record<ConnectorType, ToolVerbosity>>;
  /** Per-tool overrides (danger level and/or reporting) */
  overrides?: Record<string, ToolOverride>;
}

/** Heartbeat configuration for the engine's periodic agent check */
export interface HeartbeatConfig {
  /** Whether the heartbeat is enabled (default: true) */
  enabled: boolean;
  /** Interval in minutes between heartbeat checks (default: 30) */
  intervalMinutes: number;
  /** Path to the heartbeat checklist file relative to ARIA_HOME (default: "HEARTBEAT.md") */
  checklistPath?: string;
  /** Token the agent returns to indicate nothing needs attention (default: "HEARTBEAT_OK") */
  suppressToken: string;
}

export interface ContextFilesConfig {
  enabled?: boolean;
  maxFileChars?: number;
  maxHintChars?: number;
}

export interface CheckpointsConfig {
  enabled?: boolean;
  maxSnapshots?: number;
}

export interface MCPServerToolFilterConfig {
  include?: string[];
  exclude?: string[];
  resources?: boolean;
  prompts?: boolean;
}

export interface MCPServerConfig {
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  /** Trust level assigned to the server registration */
  trust?: "trusted" | "prompt" | "blocked";
  /** Whether the server is available by default in all sessions or requires explicit opt-in */
  sessionAvailability?: "all" | "session_opt_in" | "admin_only";
  tools?: MCPServerToolFilterConfig;
}

export interface DeliveryTarget {
  connector?: string;
}

export interface RetryPolicy {
  /** Total attempts including the initial run (default: 1) */
  maxAttempts?: number;
  /** Delay between attempts in seconds (default: 0) */
  delaySeconds?: number;
}

/** A user-defined scheduled task */
export interface CronTask {
  id?: string;
  name: string;
  /** 5-field cron expression */
  schedule: string;
  prompt: string;
  enabled: boolean;
  paused?: boolean;
  /** If true, auto-remove after first execution */
  oneShot?: boolean;
  /** Optional model override for this task */
  model?: string;
  /** ISO timestamp for one-shot tasks scheduled at a specific time */
  runAt?: string;
  /** Tool allowlist — only these tools are available (default: CRON_DEFAULT_TOOLS) */
  allowedTools?: string[];
  /** Named toolsets to expand into the allowed tool list */
  allowedToolsets?: string[];
  /** Skills injected into the job session */
  skills?: string[];
  /** Optional retry behavior for failed runs */
  retryPolicy?: RetryPolicy;
  /** Optional delivery target for the final response */
  delivery?: DeliveryTarget;
  scheduleKind?: "cron" | "interval" | "once";
  intervalMinutes?: number;
  lastRunAt?: string;
  nextRunAt?: string | null;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  createdBySessionId?: string;
}

/** A user-defined webhook-triggered automation task */
export interface WebhookTask {
  id?: string;
  /** Human-readable task name */
  name: string;
  /** URL slug: /webhook/tasks/<slug> */
  slug: string;
  /** Prompt template — use {{payload}} for the request body */
  prompt: string;
  enabled: boolean;
  /** Optional model override for this task */
  model?: string;
  /** Tool allowlist — only these tools are available (default: WEBHOOK_DEFAULT_TOOLS) */
  allowedTools?: string[];
  /** Named toolsets to expand into the allowed tool list */
  allowedToolsets?: string[];
  /** Skills injected into the task session */
  skills?: string[];
  /** Optional retry behavior for failed runs */
  retryPolicy?: RetryPolicy;
  /** Optional delivery target override */
  delivery?: DeliveryTarget;
  lastRunAt?: string;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  createdBySessionId?: string;
}

/** Automation configuration (cron + webhook tasks) */
export interface AutomationConfig {
  cronTasks: CronTask[];
  webhookTasks?: WebhookTask[];
}

export interface RuntimeConfig {
  activeModel: string;
  telegramBotTokenEnvVar: string;
  memory: {
    enabled: boolean;
    directory: string;
    /** Search configuration */
    search?: {
      /** Maximum number of search results (default: 10) */
      maxResults?: number;
      /** Weight for vector similarity in hybrid search (default: 0.6) */
      vectorWeight?: number;
      /** Weight for BM25 text score in hybrid search (default: 0.4) */
      textWeight?: number;
      /** Temporal decay settings for journal entries */
      temporalDecay?: {
        /** Whether temporal decay is enabled (default: true) */
        enabled?: boolean;
        /** Half-life in days — score halves every N days (default: 30) */
        halfLifeDays?: number;
      };
    };
    /** Journal (daily log) configuration */
    journal?: {
      /** Whether daily journal is enabled (default: true) */
      enabled?: boolean;
    };
  };
  /** Per-connector tool approval mode (default: "never" for tui, "ask" for IM connectors) */
  toolApproval?: ToolApprovalConfig;
  /** Webhook connector configuration */
  webhook?: {
    enabled: boolean;
    /** Shared bearer token for authenticating all webhook endpoints */
    token?: string;
  };
  /** Audio transcription configuration */
  audio?: {
    enabled: boolean;
    /** Prefer local Whisper over cloud API when both are available */
    preferLocal: boolean;
  };
  /** Plain (non-secret) environment variables injected at engine startup */
  env?: Record<string, string>;
  /** Map each model tier to a configured model name */
  modelTiers?: Partial<Record<ModelTier, string>>;
  /** Override the default task-to-tier mapping */
  taskTierOverrides?: Partial<Record<TaskType, ModelTier>>;
  /** Shorthand aliases for model names (e.g. { "fast": "haiku", "smart": "opus" }) */
  modelAliases?: Record<string, string>;
  /** Security configuration */
  security?: {
    /** Session token TTL in seconds (default: 86400 = 24h) */
    sessionTTL?: number;
    /** Pairing code TTL in seconds (default: 600 = 10min) */
    pairingTTL?: number;
    /** Pairing code length (default: 8) */
    pairingCodeLength?: number;
    /** Exec working directory fence */
    exec?: {
      /** Allowed working directories (default: ["~/projects", "/tmp"]) */
      fence?: string[];
      /** Always-denied paths (default: ["~/.aria", "~/.ssh", "~/.gnupg", "~/.aws", "~/.config/gcloud"]) */
      alwaysDeny?: string[];
    };
    /** Default security mode for new sessions */
    defaultMode?: "default" | "trusted" | "unrestricted";
    /** Auto-revert TTL per elevated mode */
    modeTTL?: {
      /** Trusted mode TTL in seconds (default: 3600 = 1 hour) */
      trusted?: number;
      /** Unrestricted mode TTL in seconds (default: 1800 = 30 min) */
      unrestricted?: number;
    };
    /** Whether unrestricted mode can be activated from IM connectors (default: false) */
    allowUnrestrictedFromIM?: boolean;
  };
  /** URL policy for web_fetch — SSRF protection */
  urlPolicy?: {
    additionalBlockedHosts?: string[];
    allowedExceptions?: string[];
  };
  /** Tool policy: per-connector verbosity and per-tool overrides */
  toolPolicy?: ToolPolicyConfig;
  /** Heartbeat configuration */
  heartbeat?: HeartbeatConfig;
  /** Automation configuration (cron tasks) */
  automation?: AutomationConfig;
  /** Context file loading and progressive hint discovery */
  contextFiles?: ContextFilesConfig;
  /** Filesystem checkpoint safety net */
  checkpoints?: CheckpointsConfig;
  /** External MCP servers */
  mcp?: {
    servers?: Record<string, MCPServerConfig>;
  };
  /** Orchestration (sub-agent) configuration */
  orchestration?: {
    /** Default model tier for sub-agents (default: "eco") */
    defaultTier?: string;
    /** Default sub-agent timeout in ms (default: 120_000) */
    defaultTimeoutMs?: number;
    /** Whether sub-agents can write to memory by default (default: true) */
    memoryWriteDefault?: boolean;
    /** Max concurrent background sub-agents (default: 3) */
    maxConcurrent?: number;
    /** Max sub-agents per agent turn (default: 10) */
    maxSubAgentsPerTurn?: number;
    /** Result retention time in ms (default: 1_800_000 = 30 min) */
    resultRetentionMs?: number;
    /** Whether delegated progress should be surfaced back to the parent session */
    reportProgress?: boolean;
  };
}

/** On-disk config.json schema (v3 — merged models + runtime) */
export interface AriaConfigFile {
  version: 3;
  runtime: RuntimeConfig;
  providers: ProviderConfig[];
  models: ModelConfig[];
  defaultModel: string;
}

/** Full in-memory config (identity from IDENTITY.md + everything else from config.json) */
export interface AriaConfig {
  identity: Identity;
  runtime: RuntimeConfig;
  providers: ProviderConfig[];
  models: ModelConfig[];
  defaultModel: string;
}

export interface SecretsFile {
  /** Map of env var name → raw API key, e.g. { "ANTHROPIC_API_KEY": "sk-..." } */
  apiKeys: Record<string, string>;
  /** Raw Telegram bot token, if stored */
  botToken?: string;
  /** Telegram chat ID of the paired user — bot ignores all other senders */
  pairedChatId?: number;
  /** One-time pairing code generated by the wizard; user sends /pair <code> to activate filtering */
  pairingCode?: string;
  /** Raw Discord bot token, if stored */
  discordToken?: string;
  /** Discord guild (server) ID for bot operation */
  discordGuildId?: string;
}
