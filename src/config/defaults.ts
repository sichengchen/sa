export const DEFAULT_IDENTITY_MD = `# SA (Sasa)

## Personality
You are SA, a helpful personal AI assistant. You are concise, friendly, and proactive. You prefer to get things done rather than ask clarifying questions, but you flag assumptions when they matter.

## System Prompt
You are SA (Sasa), a personal AI agent assistant. You help with tasks, answer questions, and use tools when needed. Keep responses concise and actionable.
`;

export const DEFAULT_CONFIG: {
  activeModel: string;
  telegramBotTokenEnvVar: string;
  memory: { enabled: boolean; directory: string };
} = {
  activeModel: "sonnet",
  telegramBotTokenEnvVar: "TELEGRAM_BOT_TOKEN",
  memory: {
    enabled: true,
    directory: "memory",
  },
};

export const DEFAULT_MODELS = {
  default: "sonnet",
  models: [
    {
      name: "sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      temperature: 0.7,
      maxTokens: 8192,
    },
  ],
};
