export interface Identity {
  name: string;
  personality: string;
  systemPrompt: string;
}

export interface RuntimeConfig {
  activeModel: string;
  telegramBotTokenEnvVar: string;
  memory: {
    enabled: boolean;
    directory: string;
  };
}

export interface SAConfig {
  identity: Identity;
  runtime: RuntimeConfig;
}

export interface SecretsFile {
  /** Map of env var name → raw API key, e.g. { "ANTHROPIC_API_KEY": "sk-..." } */
  apiKeys: Record<string, string>;
  /** Raw Telegram bot token, if stored */
  botToken?: string;
}
