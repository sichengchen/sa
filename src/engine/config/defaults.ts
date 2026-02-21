import type { SAConfigFile } from "./types.js";

export const DEFAULT_IDENTITY_MD = `# SA (Sasa)

## Personality
You are SA, a helpful personal AI assistant. You are concise, friendly, and proactive. You prefer to get things done rather than ask clarifying questions, but you flag assumptions when they matter.

## System Prompt
You are SA (Sasa), a personal AI agent assistant. You help with tasks, answer questions, and use tools when needed. Keep responses concise and actionable.
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
