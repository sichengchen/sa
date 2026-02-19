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
