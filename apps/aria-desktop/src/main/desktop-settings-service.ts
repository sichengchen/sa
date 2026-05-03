import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import { createLocalAccessClient } from "@aria/access-client/local";
import type { ModelConfig, ProviderConfig } from "@aria/gateway/router/types";
import { CLI_NAME, PRODUCT_NAME, RUNTIME_NAME } from "@aria/server/brand";
import { ConfigManager, type AriaConfigFile, type SecretsFile } from "@aria/server/config";
import type {
  AriaDesktopSettingsApprovalMode,
  AriaDesktopSettingsConnectorType,
  AriaDesktopSettingsDefaultSpace,
  AriaDesktopSettingsModelTier,
  AriaDesktopSettingsPatch,
  AriaDesktopSettingsProviderPreset,
  AriaDesktopSettingsProviderType,
  AriaDesktopSettingsState,
  AriaDesktopSettingsTheme,
  AriaDesktopSettingsVerbosity,
} from "../shared/api.js";

const DESKTOP_SETTINGS_VERSION = 1;
const IM_CONNECTORS = [
  "telegram",
  "discord",
  "slack",
  "teams",
  "gchat",
  "github",
  "linear",
  "wechat",
] as const;
const MODEL_TIERS: AriaDesktopSettingsModelTier[] = ["performance", "normal", "eco"];

const PROVIDER_PRESETS: AriaDesktopSettingsProviderPreset[] = [
  {
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    id: "anthropic",
    label: "Anthropic",
    type: "anthropic",
  },
  {
    apiKeyEnvVar: "OPENAI_API_KEY",
    id: "openai",
    label: "OpenAI",
    type: "openai",
  },
  {
    apiKeyEnvVar: "GOOGLE_AI_API_KEY",
    id: "google",
    label: "Google",
    type: "google",
  },
  {
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    id: "openrouter",
    label: "OpenRouter",
    type: "openrouter",
  },
  {
    apiKeyEnvVar: "NVIDIA_API_KEY",
    id: "nvidia",
    label: "Nvidia NIM",
    type: "nvidia",
  },
  {
    apiKeyEnvVar: "MINIMAX_API_KEY",
    baseUrl: "https://api.minimaxi.com/anthropic",
    id: "minimax-anthropic",
    label: "MiniMax CN",
    type: "anthropic",
  },
  {
    apiKeyEnvVar: "MINIMAX_API_KEY",
    baseUrl: "https://api.minimax.io/anthropic",
    id: "minimax-intl-anthropic",
    label: "MiniMax Intl",
    type: "anthropic",
  },
];

const CONNECTOR_SECRET_GROUPS: Array<{
  approvalConnector: AriaDesktopSettingsConnectorType;
  label: string;
  name: string;
  secrets: Array<{ key: string; label: string; legacyKey?: keyof SecretsFile }>;
  webhookBacked?: boolean;
}> = [
  {
    approvalConnector: "telegram",
    label: "Telegram",
    name: "telegram",
    secrets: [{ key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", legacyKey: "botToken" }],
  },
  {
    approvalConnector: "discord",
    label: "Discord",
    name: "discord",
    secrets: [
      { key: "DISCORD_TOKEN", label: "Bot Token", legacyKey: "discordToken" },
      { key: "DISCORD_GUILD_ID", label: "Guild ID", legacyKey: "discordGuildId" },
    ],
  },
  {
    approvalConnector: "slack",
    label: "Slack",
    name: "slack",
    secrets: [
      { key: "SLACK_BOT_TOKEN", label: "Bot Token" },
      { key: "SLACK_SIGNING_SECRET", label: "Signing Secret" },
      { key: "SLACK_APP_TOKEN", label: "App Token" },
    ],
  },
  {
    approvalConnector: "teams",
    label: "Teams",
    name: "teams",
    secrets: [
      { key: "TEAMS_BOT_ID", label: "Bot ID" },
      { key: "TEAMS_BOT_PASSWORD", label: "Bot Password" },
    ],
  },
  {
    approvalConnector: "gchat",
    label: "Google Chat",
    name: "gchat",
    secrets: [{ key: "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY", label: "Service Account Key" }],
  },
  {
    approvalConnector: "github",
    label: "GitHub",
    name: "github",
    secrets: [
      { key: "GITHUB_TOKEN", label: "Token" },
      { key: "GITHUB_WEBHOOK_SECRET", label: "Webhook Secret" },
    ],
  },
  {
    approvalConnector: "linear",
    label: "Linear",
    name: "linear",
    secrets: [
      { key: "LINEAR_API_KEY", label: "API Key" },
      { key: "LINEAR_WEBHOOK_SECRET", label: "Webhook Secret" },
    ],
  },
  {
    approvalConnector: "wechat",
    label: "WeChat",
    name: "wechat",
    secrets: [],
  },
  {
    approvalConnector: "webhook",
    label: "Webhook",
    name: "webhook",
    secrets: [],
    webhookBacked: true,
  },
];

type DesktopSettingsFile = {
  version: typeof DESKTOP_SETTINGS_VERSION;
  compactMode: boolean;
  defaultSpace: AriaDesktopSettingsDefaultSpace;
  theme: AriaDesktopSettingsTheme;
};

type DesktopSettingsClient = ReturnType<typeof createLocalAccessClient>;
type DesktopSettingsApp = {
  getLoginItemSettings(): { openAtLogin: boolean };
  getPath(name: "userData"): string;
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
};

const DEFAULT_DESKTOP_SETTINGS: DesktopSettingsFile = {
  compactMode: true,
  defaultSpace: "projects",
  theme: "system",
  version: DESKTOP_SETTINGS_VERSION,
};

function normalizeDesktopSettings(value: Partial<DesktopSettingsFile>): DesktopSettingsFile {
  return {
    compactMode:
      typeof value.compactMode === "boolean"
        ? value.compactMode
        : DEFAULT_DESKTOP_SETTINGS.compactMode,
    defaultSpace:
      value.defaultSpace === "chat" || value.defaultSpace === "projects"
        ? value.defaultSpace
        : DEFAULT_DESKTOP_SETTINGS.defaultSpace,
    theme:
      value.theme === "dark" || value.theme === "light" || value.theme === "system"
        ? value.theme
        : DEFAULT_DESKTOP_SETTINGS.theme,
    version: DESKTOP_SETTINGS_VERSION,
  };
}

function getApproval(
  config: AriaConfigFile,
  connector: string,
  fallback: AriaDesktopSettingsApprovalMode,
): AriaDesktopSettingsApprovalMode {
  const value =
    config.runtime.toolApproval?.[connector as keyof typeof config.runtime.toolApproval];
  return value === "always" || value === "ask" || value === "never" ? value : fallback;
}

function getVerbosity(
  config: AriaConfigFile,
  connector: string,
  fallback: AriaDesktopSettingsVerbosity,
): AriaDesktopSettingsVerbosity {
  const value =
    config.runtime.toolPolicy?.verbosity?.[
      connector as keyof NonNullable<typeof config.runtime.toolPolicy>["verbosity"]
    ];
  return value === "minimal" || value === "silent" || value === "verbose" ? value : fallback;
}

function commonConnectorApproval(config: AriaConfigFile): AriaDesktopSettingsApprovalMode {
  const values = IM_CONNECTORS.map((connector) => getApproval(config, connector, "ask"));
  return values.every((value) => value === values[0]) ? values[0]! : "ask";
}

function commonConnectorVerbosity(config: AriaConfigFile): AriaDesktopSettingsVerbosity {
  const values = IM_CONNECTORS.map((connector) => getVerbosity(config, connector, "silent"));
  return values.every((value) => value === values[0]) ? values[0]! : "silent";
}

function isSecretConfigured(secrets: SecretsFile | null, key: string): boolean {
  return Boolean(secrets?.apiKeys?.[key]);
}

function getSecretValue(
  secrets: SecretsFile | null,
  key: string,
  legacyKey?: keyof SecretsFile,
): string | undefined {
  const apiKey = secrets?.apiKeys?.[key];
  if (apiKey) {
    return apiKey;
  }
  const legacyValue = legacyKey ? secrets?.[legacyKey] : undefined;
  return typeof legacyValue === "string" ? legacyValue : undefined;
}

function maskSecret(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function buildConnectorStatus(
  config: AriaConfigFile,
  secrets: SecretsFile | null,
): AriaDesktopSettingsState["connectors"] {
  return CONNECTOR_SECRET_GROUPS.map((connector) => {
    const secretRows = connector.secrets.map((secret) => {
      const value = getSecretValue(secrets, secret.key, secret.legacyKey);
      return {
        configured: Boolean(value),
        key: secret.key,
        label: secret.label,
        maskedValue: maskSecret(value),
      };
    });

    return {
      approval: getApproval(config, connector.approvalConnector, "ask"),
      configured:
        connector.name === "wechat"
          ? Boolean(secrets?.wechatAccounts?.length)
          : connector.webhookBacked
            ? (config.runtime.webhook?.enabled ?? false)
            : secretRows.some((secret) => secret.configured),
      label: connector.label,
      name: connector.name,
      secrets: secretRows,
      webhookEnabled: connector.webhookBacked
        ? (config.runtime.webhook?.enabled ?? false)
        : undefined,
    };
  });
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : fallback;
}

function normalizeProviderType(type: string): AriaDesktopSettingsProviderType {
  if (
    type === "anthropic" ||
    type === "openai" ||
    type === "google" ||
    type === "openrouter" ||
    type === "nvidia" ||
    type === "openai-compat"
  ) {
    return type;
  }
  return "openai-compat";
}

function providerLabel(provider: ProviderConfig): string {
  return PROVIDER_PRESETS.find((preset) => preset.id === provider.id)?.label ?? provider.id;
}

function buildProviderStatus(
  config: AriaConfigFile,
  secrets: SecretsFile | null,
): AriaDesktopSettingsState["runtime"]["providers"] {
  return config.providers.map((provider) => ({
    apiKeyConfigured: isSecretConfigured(secrets, provider.apiKeyEnvVar),
    apiKeyEnvVar: provider.apiKeyEnvVar,
    baseUrl: provider.baseUrl,
    id: provider.id,
    label: providerLabel(provider),
    modelCount: config.models.filter((model) => model.provider === provider.id).length,
    type: normalizeProviderType(provider.type),
  }));
}

function modelTiersFor(
  modelName: string,
  tiers: Partial<Record<AriaDesktopSettingsModelTier, string>>,
): AriaDesktopSettingsModelTier[] {
  return MODEL_TIERS.filter((tier) => tiers[tier] === modelName);
}

function buildModelStatus(config: AriaConfigFile): AriaDesktopSettingsState["runtime"]["models"] {
  const tiers = config.runtime.modelTiers ?? {};
  return config.models.map((model) => ({
    fallback: model.fallback ?? null,
    label: `${model.name} (${model.provider}/${model.model})`,
    maxTokens: model.maxTokens ?? null,
    model: model.model,
    name: model.name,
    provider: model.provider,
    selected: model.name === config.defaultModel,
    temperature: model.temperature ?? null,
    tiers: modelTiersFor(model.name, tiers),
    type: model.type ?? "chat",
  }));
}

export class DesktopSettingsService {
  private readonly client: DesktopSettingsClient;
  private readonly config = new ConfigManager();
  private readonly electronApp: DesktopSettingsApp;
  private readonly settingsPath: string;
  private desktopSettings: DesktopSettingsFile = DEFAULT_DESKTOP_SETTINGS;
  private loaded = false;
  private readonly listeners = new Set<(state: AriaDesktopSettingsState) => void>();

  constructor(
    settingsPath?: string,
    client = createLocalAccessClient(),
    electronApp: DesktopSettingsApp = app,
  ) {
    this.client = client;
    this.electronApp = electronApp;
    this.settingsPath =
      settingsPath ?? join(electronApp.getPath("userData"), "desktop-settings.json");
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await this.config.load();

    if (existsSync(this.settingsPath)) {
      try {
        const raw = await readFile(this.settingsPath, "utf-8");
        this.desktopSettings = normalizeDesktopSettings(JSON.parse(raw));
      } catch {
        await this.saveDesktopSettings(DEFAULT_DESKTOP_SETTINGS);
      }
    } else {
      await this.saveDesktopSettings(DEFAULT_DESKTOP_SETTINGS);
    }

    this.loaded = true;
  }

  private async saveDesktopSettings(settings: DesktopSettingsFile): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    this.desktopSettings = settings;
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }

  private getStartAtLogin(): boolean {
    return this.electronApp.getLoginItemSettings().openAtLogin;
  }

  private setStartAtLogin(openAtLogin: boolean): void {
    this.electronApp.setLoginItemSettings({ openAtLogin });
  }

  private async snapshot(lastError: string | null = null): Promise<AriaDesktopSettingsState> {
    await this.ensureLoaded();

    const config = this.config.getConfigFile();
    const runtime = config.runtime;
    const secrets = await this.config.loadSecrets();
    const activeModel = config.defaultModel || runtime.activeModel;

    return {
      about: {
        channel: "Desktop",
        cliName: CLI_NAME,
        productName: PRODUCT_NAME,
        runtimeName: RUNTIME_NAME,
      },
      connectors: buildConnectorStatus(config, secrets),
      desktop: {
        compactMode: this.desktopSettings.compactMode,
        defaultSpace: this.desktopSettings.defaultSpace,
        settingsPath: this.settingsPath,
        startAtLogin: this.getStartAtLogin(),
        theme: this.desktopSettings.theme,
      },
      lastError,
      runtime: {
        activeModel,
        checkpointMaxSnapshots: normalizePositiveInteger(runtime.checkpoints?.maxSnapshots, 50),
        checkpointsEnabled: runtime.checkpoints?.enabled !== false,
        connectorApproval: commonConnectorApproval(config),
        connectorVerbosity: commonConnectorVerbosity(config),
        contextFilesEnabled: runtime.contextFiles?.enabled !== false,
        cronTaskCount: runtime.automation?.cronTasks?.length ?? 0,
        defaultModel: config.defaultModel,
        heartbeatEnabled: runtime.heartbeat?.enabled ?? true,
        heartbeatIntervalMinutes: normalizePositiveInteger(runtime.heartbeat?.intervalMinutes, 30),
        homeDir: this.config.homeDir,
        journalEnabled: runtime.memory.journal?.enabled !== false,
        mcpServerCount: Object.keys(runtime.mcp?.servers ?? {}).length,
        memoryDirectory: runtime.memory.directory,
        memoryEnabled: runtime.memory.enabled,
        modelTiers: runtime.modelTiers ?? {},
        models: buildModelStatus(config),
        providerPresets: PROVIDER_PRESETS,
        providers: buildProviderStatus(config, secrets),
        providerCount: config.providers.length,
        securityMode: runtime.security?.defaultMode ?? "default",
        tuiApproval: getApproval(config, "tui", "never"),
        tuiVerbosity: getVerbosity(config, "tui", "minimal"),
        webhookApproval: getApproval(config, "webhook", "never"),
        webhookEnabled: runtime.webhook?.enabled ?? false,
        webhookTaskCount: runtime.automation?.webhookTasks?.length ?? 0,
      },
    };
  }

  subscribe(listener: (state: AriaDesktopSettingsState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async emit(state?: AriaDesktopSettingsState): Promise<AriaDesktopSettingsState> {
    const nextState = state ?? (await this.snapshot());
    for (const listener of this.listeners) {
      listener(nextState);
    }
    return nextState;
  }

  async getSettingsState(): Promise<AriaDesktopSettingsState> {
    return this.snapshot();
  }

  async updateSettings(patch: AriaDesktopSettingsPatch): Promise<AriaDesktopSettingsState> {
    await this.ensureLoaded();

    if (patch.desktop) {
      const { startAtLogin, ...desktopPatch } = patch.desktop;
      await this.saveDesktopSettings(
        normalizeDesktopSettings({ ...this.desktopSettings, ...desktopPatch }),
      );
      if (typeof startAtLogin === "boolean") {
        this.setStartAtLogin(startAtLogin);
      }
    }

    if (patch.provider) {
      let config = this.config.getConfigFile();
      const secrets = (await this.config.loadSecrets()) ?? { apiKeys: {} };

      if (patch.provider.add) {
        const provider = patch.provider.add;
        if (!provider.id.trim()) {
          throw new Error("Provider id is required.");
        }
        if (config.providers.some((entry) => entry.id === provider.id)) {
          throw new Error(`Provider "${provider.id}" already exists.`);
        }

        const nextProvider: ProviderConfig = {
          apiKeyEnvVar: provider.apiKeyEnvVar.trim(),
          id: provider.id.trim(),
          type: provider.type as ProviderConfig["type"],
          ...(provider.baseUrl?.trim() ? { baseUrl: provider.baseUrl.trim() } : {}),
        };

        if (provider.apiKey?.trim()) {
          secrets.apiKeys = {
            ...secrets.apiKeys,
            [nextProvider.apiKeyEnvVar]: provider.apiKey.trim(),
          };
          await this.config.saveSecrets(secrets);
        }

        const nextConfig = {
          ...config,
          providers: [...config.providers, nextProvider],
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
      }

      if (patch.provider.updateApiKey) {
        const { envVar, value } = patch.provider.updateApiKey;
        const nextSecrets: SecretsFile = { ...secrets, apiKeys: { ...secrets.apiKeys } };
        if (value?.trim()) {
          nextSecrets.apiKeys[envVar] = value.trim();
        } else {
          delete nextSecrets.apiKeys[envVar];
        }
        await this.config.saveSecrets(nextSecrets);
      }

      if (patch.provider.deleteId) {
        const providerId = patch.provider.deleteId;
        const modelCount = config.models.filter((model) => model.provider === providerId).length;
        if (modelCount > 0) {
          throw new Error(`Delete models using "${providerId}" before removing this provider.`);
        }
        const nextConfig = {
          ...config,
          providers: config.providers.filter((provider) => provider.id !== providerId),
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
      }
    }

    if (patch.model) {
      let config = this.config.getConfigFile();
      let runtime = config.runtime;

      if (patch.model.add) {
        const model = patch.model.add;
        if (!model.name.trim()) {
          throw new Error("Model name is required.");
        }
        if (!model.model.trim()) {
          throw new Error("Provider model id is required.");
        }
        if (!config.providers.some((provider) => provider.id === model.provider)) {
          throw new Error(`Provider "${model.provider}" does not exist.`);
        }
        if (config.models.some((entry) => entry.name === model.name)) {
          throw new Error(`Model "${model.name}" already exists.`);
        }

        const nextModel: ModelConfig = {
          model: model.model.trim(),
          name: model.name.trim(),
          provider: model.provider,
          ...(model.type === "embedding" ? { type: "embedding" as const } : {}),
          ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
          ...(typeof model.maxTokens === "number"
            ? { maxTokens: normalizePositiveInteger(model.maxTokens, 8192) }
            : {}),
        };

        const nextConfig = {
          ...config,
          defaultModel:
            nextModel.type === "embedding" || config.defaultModel
              ? config.defaultModel
              : nextModel.name,
          models: [...config.models, nextModel],
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
        runtime = config.runtime;
      }

      if (patch.model.setDefault) {
        const model = config.models.find((entry) => entry.name === patch.model!.setDefault);
        if (!model || model.type === "embedding") {
          throw new Error("Default model must be a configured chat model.");
        }
        try {
          await this.client.model.switch.mutate({ name: model.name });
        } catch {
          // Persist the config even if the running node is not reachable; the model applies on restart.
        }
        const nextConfig = {
          ...config,
          defaultModel: model.name,
          runtime: { ...runtime, activeModel: model.name },
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
        runtime = config.runtime;
      }

      if (patch.model.setTier) {
        const { tier, modelName } = patch.model.setTier;
        const nextTiers = { ...runtime.modelTiers };
        if (modelName) {
          const model = config.models.find((entry) => entry.name === modelName);
          if (!model || model.type === "embedding") {
            throw new Error("Tier model must be a configured chat model.");
          }
          nextTiers[tier] = modelName;
        } else {
          delete nextTiers[tier];
        }
        const nextConfig = {
          ...config,
          runtime: {
            ...runtime,
            modelTiers: Object.keys(nextTiers).length > 0 ? nextTiers : undefined,
          },
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
        runtime = config.runtime;
      }

      if (patch.model.deleteName) {
        const target = config.models.find((model) => model.name === patch.model!.deleteName);
        if (!target) {
          throw new Error(`Model "${patch.model.deleteName}" does not exist.`);
        }
        if (target.name === config.defaultModel) {
          throw new Error("Set another default model before deleting this one.");
        }
        const nextTiers = { ...runtime.modelTiers };
        for (const tier of MODEL_TIERS) {
          if (nextTiers[tier] === target.name) {
            delete nextTiers[tier];
          }
        }
        const nextConfig = {
          ...config,
          models: config.models.filter((model) => model.name !== target.name),
          runtime: {
            ...runtime,
            modelTiers: Object.keys(nextTiers).length > 0 ? nextTiers : undefined,
          },
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
        runtime = config.runtime;
      }
    }

    if (patch.connector) {
      let config = this.config.getConfigFile();

      const secretUpdates = [
        ...(patch.connector.updateSecret ? [patch.connector.updateSecret] : []),
        ...(patch.connector.updateSecrets ?? []),
      ];

      if (secretUpdates.length > 0) {
        const secrets = (await this.config.loadSecrets()) ?? { apiKeys: {} };
        const nextSecrets: SecretsFile = { ...secrets, apiKeys: { ...secrets.apiKeys } };
        for (const { key, value } of secretUpdates) {
          if (value?.trim()) {
            nextSecrets.apiKeys[key] = value.trim();
          } else {
            delete nextSecrets.apiKeys[key];
          }
          if (key === "TELEGRAM_BOT_TOKEN") {
            delete nextSecrets.botToken;
          }
          if (key === "DISCORD_TOKEN") {
            delete nextSecrets.discordToken;
          }
          if (key === "DISCORD_GUILD_ID") {
            delete nextSecrets.discordGuildId;
          }
        }
        await this.config.saveSecrets(nextSecrets);
      }

      if (patch.connector.setApproval) {
        const nextConfig = {
          ...config,
          runtime: {
            ...config.runtime,
            toolApproval: {
              ...config.runtime.toolApproval,
              [patch.connector.setApproval.connector]: patch.connector.setApproval.mode,
            },
          },
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
      }

      if (typeof patch.connector.webhookEnabled === "boolean") {
        const nextConfig = {
          ...config,
          runtime: {
            ...config.runtime,
            webhook: {
              ...config.runtime.webhook,
              enabled: patch.connector.webhookEnabled,
            },
          },
        };
        await this.config.saveConfig(nextConfig);
        config = nextConfig;
      }
    }

    if (patch.runtime) {
      const config = this.config.getConfigFile();
      const runtime = config.runtime;
      const nextRuntime = { ...runtime };

      if (patch.runtime.activeModel) {
        try {
          await this.client.model.switch.mutate({ name: patch.runtime.activeModel });
        } catch {
          // Persist the config even if the running node is not reachable; the model applies on restart.
        }
        nextRuntime.activeModel = patch.runtime.activeModel;
        config.defaultModel = patch.runtime.activeModel;
      }

      if (typeof patch.runtime.memoryEnabled === "boolean") {
        nextRuntime.memory = { ...nextRuntime.memory, enabled: patch.runtime.memoryEnabled };
      }

      if (typeof patch.runtime.journalEnabled === "boolean") {
        nextRuntime.memory = {
          ...nextRuntime.memory,
          journal: {
            ...nextRuntime.memory.journal,
            enabled: patch.runtime.journalEnabled,
          },
        };
      }

      if (typeof patch.runtime.contextFilesEnabled === "boolean") {
        nextRuntime.contextFiles = {
          ...nextRuntime.contextFiles,
          enabled: patch.runtime.contextFilesEnabled,
        };
      }

      if (typeof patch.runtime.checkpointsEnabled === "boolean") {
        nextRuntime.checkpoints = {
          ...nextRuntime.checkpoints,
          enabled: patch.runtime.checkpointsEnabled,
          maxSnapshots: normalizePositiveInteger(nextRuntime.checkpoints?.maxSnapshots, 50),
        };
      }

      if (typeof patch.runtime.checkpointMaxSnapshots === "number") {
        nextRuntime.checkpoints = {
          ...nextRuntime.checkpoints,
          enabled: nextRuntime.checkpoints?.enabled ?? true,
          maxSnapshots: normalizePositiveInteger(patch.runtime.checkpointMaxSnapshots, 50),
        };
      }

      if (typeof patch.runtime.heartbeatEnabled === "boolean") {
        nextRuntime.heartbeat = {
          checklistPath: "HEARTBEAT.md",
          intervalMinutes: normalizePositiveInteger(nextRuntime.heartbeat?.intervalMinutes, 30),
          suppressToken: "HEARTBEAT_OK",
          ...nextRuntime.heartbeat,
          enabled: patch.runtime.heartbeatEnabled,
        };
      }

      if (typeof patch.runtime.heartbeatIntervalMinutes === "number") {
        nextRuntime.heartbeat = {
          checklistPath: "HEARTBEAT.md",
          enabled: nextRuntime.heartbeat?.enabled ?? true,
          suppressToken: "HEARTBEAT_OK",
          ...nextRuntime.heartbeat,
          intervalMinutes: normalizePositiveInteger(patch.runtime.heartbeatIntervalMinutes, 30),
        };
      }

      if (typeof patch.runtime.webhookEnabled === "boolean") {
        nextRuntime.webhook = { ...nextRuntime.webhook, enabled: patch.runtime.webhookEnabled };
      }

      if (patch.runtime.securityMode) {
        nextRuntime.security = {
          ...nextRuntime.security,
          defaultMode: patch.runtime.securityMode,
        };
      }

      if (patch.runtime.tuiApproval) {
        nextRuntime.toolApproval = {
          ...nextRuntime.toolApproval,
          tui: patch.runtime.tuiApproval,
        };
      }

      if (patch.runtime.webhookApproval) {
        nextRuntime.toolApproval = {
          ...nextRuntime.toolApproval,
          webhook: patch.runtime.webhookApproval,
        };
      }

      if (patch.runtime.connectorApproval) {
        nextRuntime.toolApproval = {
          ...nextRuntime.toolApproval,
          ...Object.fromEntries(
            IM_CONNECTORS.map((connector) => [connector, patch.runtime!.connectorApproval]),
          ),
        };
      }

      if (patch.runtime.tuiVerbosity) {
        nextRuntime.toolPolicy = {
          ...nextRuntime.toolPolicy,
          verbosity: {
            ...nextRuntime.toolPolicy?.verbosity,
            tui: patch.runtime.tuiVerbosity,
          },
        };
      }

      if (patch.runtime.connectorVerbosity) {
        nextRuntime.toolPolicy = {
          ...nextRuntime.toolPolicy,
          verbosity: {
            ...nextRuntime.toolPolicy?.verbosity,
            ...Object.fromEntries(
              IM_CONNECTORS.map((connector) => [connector, patch.runtime!.connectorVerbosity]),
            ),
          },
        };
      }

      config.runtime = nextRuntime;
      await this.config.saveConfig(config);
    }

    return this.emit();
  }
}
