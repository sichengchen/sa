import type { ToolApprovalMode, ConnectorType } from "@aria/protocol";
import type { ModelTier, TaskType } from "@aria/gateway/router/task-types";
import type { ProviderConfig, ModelConfig } from "@aria/gateway/router/types";

export interface Identity {
  name: string;
  personality: string;
  systemPrompt: string;
}

export type ToolApprovalConfig = Partial<Record<ConnectorType, ToolApprovalMode>>;

export type ToolVerbosity = "silent" | "minimal" | "verbose";

export interface ToolOverride {
  dangerLevel?: "safe" | "moderate" | "dangerous";
  report?: "always" | "never" | "on_error";
}

export interface ToolPolicyConfig {
  verbosity?: Partial<Record<ConnectorType, ToolVerbosity>>;
  overrides?: Record<string, ToolOverride>;
}

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  checklistPath?: string;
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
  trust?: "trusted" | "prompt" | "blocked";
  sessionAvailability?: "all" | "session_opt_in" | "admin_only";
  tools?: MCPServerToolFilterConfig;
}

export interface DeliveryTarget {
  connector?: string;
}

export interface RetryPolicy {
  maxAttempts?: number;
  delaySeconds?: number;
}

export interface CronTask {
  id?: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  paused?: boolean;
  oneShot?: boolean;
  model?: string;
  runAt?: string;
  allowedTools?: string[];
  allowedToolsets?: string[];
  skills?: string[];
  retryPolicy?: RetryPolicy;
  delivery?: DeliveryTarget;
  scheduleKind?: "cron" | "interval" | "once";
  intervalMinutes?: number;
  lastRunAt?: string;
  nextRunAt?: string | null;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  createdBySessionId?: string;
}

export interface WebhookTask {
  id?: string;
  name: string;
  slug: string;
  prompt: string;
  enabled: boolean;
  model?: string;
  allowedTools?: string[];
  allowedToolsets?: string[];
  skills?: string[];
  retryPolicy?: RetryPolicy;
  delivery?: DeliveryTarget;
  lastRunAt?: string;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  createdBySessionId?: string;
}

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
    search?: {
      maxResults?: number;
      vectorWeight?: number;
      textWeight?: number;
      temporalDecay?: {
        enabled?: boolean;
        halfLifeDays?: number;
      };
    };
    journal?: {
      enabled?: boolean;
    };
  };
  toolApproval?: ToolApprovalConfig;
  webhook?: {
    enabled: boolean;
    token?: string;
  };
  audio?: {
    enabled: boolean;
    preferLocal: boolean;
  };
  env?: Record<string, string>;
  modelTiers?: Partial<Record<ModelTier, string>>;
  taskTierOverrides?: Partial<Record<TaskType, ModelTier>>;
  modelAliases?: Record<string, string>;
  security?: {
    sessionTTL?: number;
    pairingTTL?: number;
    pairingCodeLength?: number;
    exec?: {
      fence?: string[];
      alwaysDeny?: string[];
    };
    defaultMode?: "default" | "trusted" | "unrestricted";
    modeTTL?: {
      trusted?: number;
      unrestricted?: number;
    };
    allowUnrestrictedFromIM?: boolean;
  };
  urlPolicy?: {
    additionalBlockedHosts?: string[];
    allowedExceptions?: string[];
  };
  toolPolicy?: ToolPolicyConfig;
  heartbeat?: HeartbeatConfig;
  automation?: AutomationConfig;
  contextFiles?: ContextFilesConfig;
  checkpoints?: CheckpointsConfig;
  mcp?: {
    servers?: Record<string, MCPServerConfig>;
  };
  orchestration?: {
    defaultTier?: string;
    defaultTimeoutMs?: number;
    memoryWriteDefault?: boolean;
    maxConcurrent?: number;
    maxSubAgentsPerTurn?: number;
    resultRetentionMs?: number;
    reportProgress?: boolean;
  };
}

export interface AriaConfigFile {
  version: 3;
  runtime: RuntimeConfig;
  providers: ProviderConfig[];
  models: ModelConfig[];
  defaultModel: string;
}

export interface AriaConfig {
  identity: Identity;
  runtime: RuntimeConfig;
  providers: ProviderConfig[];
  models: ModelConfig[];
  defaultModel: string;
}

export interface WeChatAccountSecret {
  accountId: string;
  botToken: string;
  apiBaseUrl?: string;
  allowedUserIds?: string[];
}

export interface SecretsFile {
  apiKeys: Record<string, string>;
  botToken?: string;
  pairedChatId?: number;
  pairingCode?: string;
  discordToken?: string;
  discordGuildId?: string;
  wechatAccounts?: WeChatAccountSecret[];
}
