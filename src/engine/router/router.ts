import { readFile, writeFile } from "node:fs/promises";
import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ModelConfig, ModelsFile, ProviderConfig } from "./types.js";
import type { SecretsFile } from "../config/types.js";

export class ModelRouter {
  private config: ModelsFile;
  private activeModelName: string;
  private configPath: string;
  private secrets: SecretsFile | null;

  private constructor(config: ModelsFile, configPath: string, secrets: SecretsFile | null) {
    this.config = config;
    this.activeModelName = config.default;
    this.configPath = configPath;
    this.secrets = secrets;
  }

  static async load(configPath: string, secrets?: SecretsFile | null): Promise<ModelRouter> {
    const raw = await readFile(configPath, "utf-8");
    const config: ModelsFile = JSON.parse(raw);

    if (config.version !== 2) {
      throw new Error(
        "models.json schema version unsupported — please re-run the onboarding wizard"
      );
    }
    if (!config.providers || config.providers.length === 0) {
      throw new Error("models.json must contain at least one provider");
    }
    if (!config.models || config.models.length === 0) {
      throw new Error("models.json must contain at least one model");
    }
    if (!config.default) {
      throw new Error("models.json must specify a default model");
    }
    const names = config.models.map((m) => m.name);
    if (!names.includes(config.default)) {
      throw new Error(
        `Default model "${config.default}" not found in models list`
      );
    }
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      throw new Error("Duplicate model names in models.json");
    }
    const providerIds = new Set(config.providers.map((p) => p.id));
    for (const model of config.models) {
      if (!providerIds.has(model.provider)) {
        throw new Error(
          `Model "${model.name}" references unknown provider "${model.provider}"`
        );
      }
    }
    return new ModelRouter(config, configPath, secrets ?? null);
  }

  /** Resolve an API key: env var takes precedence, then secrets file. */
  private resolveApiKey(envVar: string): string {
    const fromEnv = process.env[envVar];
    if (fromEnv) return fromEnv;
    const fromSecrets = this.secrets?.apiKeys[envVar];
    if (fromSecrets) return fromSecrets;
    throw new Error(
      `API key not found: set environment variable "${envVar}" or run the setup wizard to store it in secrets.enc`
    );
  }

  /** Look up a ProviderConfig by ID */
  getProvider(id: string): ProviderConfig {
    const provider = this.config.providers.find((p) => p.id === id);
    if (!provider) {
      throw new Error(`Provider "${id}" not found`);
    }
    return provider;
  }

  /** Get the PI-mono Model object for the active (or named) config */
  getModel(name?: string): Model<Api> {
    const cfg = this.getConfig(name);
    const provider = this.getProvider(cfg.provider);
    const apiKey = this.resolveApiKey(provider.apiKeyEnvVar);
    // For OpenAI-compatible providers with a custom base URL, construct the
    // Model object manually since pi-ai's getModel only handles known providers
    if (provider.baseUrl) {
      return {
        id: cfg.model,
        name: cfg.model,
        api: "openai-completions" as const,
        provider: provider.type,
        baseUrl: provider.baseUrl,
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: cfg.maxTokens ?? 4096,
      } as Model<Api>;
    }
    // Dynamic provider/model strings require type assertion since PI-mono
    // uses exact literal types for its overloaded getModel signature
    return (getModel as (p: string, m: string) => Model<Api>)(
      provider.type,
      cfg.model
    );
  }

  /** Get the raw ModelConfig for the active (or named) model */
  getConfig(name?: string): ModelConfig {
    const target = name ?? this.activeModelName;
    const cfg = this.config.models.find((m) => m.name === target);
    if (!cfg) {
      throw new Error(`Model "${target}" not found`);
    }
    return cfg;
  }

  /** Get streaming options (temperature, maxTokens, apiKey) for the active (or named) model */
  getStreamOptions(name?: string): {
    temperature?: number;
    maxTokens?: number;
    apiKey: string;
  } {
    const cfg = this.getConfig(name);
    const provider = this.getProvider(cfg.provider);
    const apiKey = this.resolveApiKey(provider.apiKeyEnvVar);
    return {
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      apiKey,
    };
  }

  /** List all configured model names */
  listModels(): string[] {
    return this.config.models.map((m) => m.name);
  }

  /** List all model configs */
  listModelConfigs(): ModelConfig[] {
    return [...this.config.models];
  }

  /** List all configured providers */
  listProviders(): ProviderConfig[] {
    return [...this.config.providers];
  }

  /** Get the currently active model name */
  getActiveModelName(): string {
    return this.activeModelName;
  }

  /** Switch the active model */
  switchModel(name: string): void {
    const exists = this.config.models.some((m) => m.name === name);
    if (!exists) {
      throw new Error(`Model "${name}" not found`);
    }
    this.activeModelName = name;
  }

  /** Add a new model configuration */
  async addModel(config: ModelConfig): Promise<void> {
    if (this.config.models.some((m) => m.name === config.name)) {
      throw new Error(`Model "${config.name}" already exists`);
    }
    if (!this.config.providers.some((p) => p.id === config.provider)) {
      throw new Error(`Provider "${config.provider}" not found`);
    }
    this.config.models.push(config);
    await this.save();
  }

  /** Remove a model configuration by name */
  async removeModel(name: string): Promise<void> {
    const idx = this.config.models.findIndex((m) => m.name === name);
    if (idx === -1) {
      throw new Error(`Model "${name}" not found`);
    }
    if (this.config.default === name) {
      throw new Error(`Cannot remove the default model "${name}"`);
    }
    this.config.models.splice(idx, 1);
    if (this.activeModelName === name) {
      this.activeModelName = this.config.default;
    }
    await this.save();
  }

  /** Add a new provider configuration */
  async addProvider(provider: ProviderConfig): Promise<void> {
    if (this.config.providers.some((p) => p.id === provider.id)) {
      throw new Error(`Provider "${provider.id}" already exists`);
    }
    this.config.providers.push(provider);
    await this.save();
  }

  /** Remove a provider configuration by ID */
  async removeProvider(id: string): Promise<void> {
    const idx = this.config.providers.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Provider "${id}" not found`);
    }
    const referencedBy = this.config.models.filter((m) => m.provider === id).map((m) => m.name);
    if (referencedBy.length > 0) {
      throw new Error(
        `Cannot remove provider "${id}" — still referenced by model(s): ${referencedBy.join(", ")}`
      );
    }
    this.config.providers.splice(idx, 1);
    await this.save();
  }

  private async save(): Promise<void> {
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2) + "\n");
  }
}
