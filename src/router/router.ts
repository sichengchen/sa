import { readFile, writeFile } from "node:fs/promises";
import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ModelConfig, ModelsFile } from "./types.js";
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

  /** Get the PI-mono Model object for the active (or named) config */
  getModel(name?: string): Model<Api> {
    const cfg = this.getConfig(name);
    const apiKey = this.resolveApiKey(cfg.apiKeyEnvVar);
    // For OpenAI-compatible providers with a custom base URL, construct the
    // Model object manually since pi-ai's getModel only handles known providers
    if (cfg.baseUrl) {
      return {
        id: cfg.model,
        name: cfg.model,
        api: "openai-completions" as const,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
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
      cfg.provider,
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
    const apiKey = this.resolveApiKey(cfg.apiKeyEnvVar);
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

  private async save(): Promise<void> {
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2) + "\n");
  }
}
