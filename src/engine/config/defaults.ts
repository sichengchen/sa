import type { SAConfigFile, HeartbeatConfig } from "./types.js";

/** Default tool allowlist for cron tasks — read + search, memory, notify */
export const CRON_DEFAULT_TOOLS = [
  "read", "web_fetch", "web_search",
  "memory_search", "memory_read", "memory_write",
  "notify",
];

/** Default tool allowlist for webhook tasks — read + search, no memory writes */
export const WEBHOOK_DEFAULT_TOOLS = [
  "read", "web_fetch", "web_search",
  "memory_search", "memory_read",
  "notify",
];

/** Default heartbeat configuration */
export const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  enabled: true,
  intervalMinutes: 30,
  checklistPath: "HEARTBEAT.md",
  suppressToken: "HEARTBEAT_OK",
};

export const DEFAULT_IDENTITY_MD = `# SA (Sasa)

## Personality
You are SA, a helpful personal AI assistant. You are concise, friendly, and proactive. You prefer to get things done rather than ask clarifying questions, but you flag assumptions when they matter.

## System Prompt
You are SA (Sasa), a personal AI agent assistant. You help with tasks, answer questions, and use tools when needed. Keep responses concise and actionable.
`;

/** Default HEARTBEAT.md content created on first run */
export const DEFAULT_HEARTBEAT_MD = `# Heartbeat checklist
- Check if any background tasks have completed — summarize results
- If idle for 8+ hours, send a brief check-in
`;

/** Default config.json (v3 — merged runtime + providers + models) */
export const DEFAULT_CONFIG: SAConfigFile = {
  version: 3,
  runtime: {
    activeModel: "sonnet",
    telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
    memory: {
      enabled: true,
      directory: "memory",
      search: {
        maxResults: 10,
        vectorWeight: 0.6,
        textWeight: 0.4,
        temporalDecay: {
          enabled: true,
          halfLifeDays: 30,
        },
      },
      journal: {
        enabled: true,
      },
    },
    toolApproval: {
      tui: "never",
      telegram: "ask",
      discord: "ask",
      slack: "ask",
      teams: "ask",
      gchat: "ask",
      github: "ask",
      linear: "ask",
      webhook: "never",
    },
    webhook: {
      enabled: false,
    },
    audio: {
      enabled: true,
      preferLocal: true,
    },
    contextFiles: {
      enabled: true,
      maxFileChars: 20_000,
      maxHintChars: 8_000,
    },
    checkpoints: {
      enabled: true,
      maxSnapshots: 50,
    },
    urlPolicy: {
      additionalBlockedHosts: [],
      allowedExceptions: [],
    },
    toolPolicy: {
      verbosity: {
        tui: "minimal",
        telegram: "silent",
        discord: "silent",
        slack: "silent",
        teams: "silent",
        gchat: "silent",
        github: "silent",
        linear: "silent",
        webhook: "silent",
      },
      overrides: {},
    },
    automation: {
      cronTasks: [],
      webhookTasks: [],
    },
    mcp: {
      servers: {},
    },
    orchestration: {
      defaultTier: "eco",
      defaultTimeoutMs: 120_000,
      memoryWriteDefault: false,
      maxConcurrent: 3,
      maxSubAgentsPerTurn: 10,
      resultRetentionMs: 1_800_000,
      reportProgress: true,
    },
  },
  providers: [
    {
      id: "anthropic",
      type: "anthropic" as any,
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
  ],
  models: [
    {
      name: "sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      temperature: 0.7,
      maxTokens: 8192,
    },
  ],
  defaultModel: "sonnet",
};
