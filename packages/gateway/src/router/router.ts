import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { SecretsFile, RuntimeConfig } from "@aria/server/config";
import type { ModelConfig, ProviderConfig } from "./types.js";
import type { ModelTier, TaskType } from "./task-types.js";
import { DEFAULT_TASK_TIER } from "./task-types.js";

const OPENAI_COMPAT_BASE_URL = "https://api.openai.com";
const MINIMAX_OPENAI_COMPAT_BASE_URL = "https://api.minimaxi.com/v1";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveOpenAICompatibleBaseUrl(provider: ProviderConfig): string {
  if (provider.baseUrl) {
    return normalizeBaseUrl(provider.baseUrl);
  }
  if (provider.type === "minimax") {
    return MINIMAX_OPENAI_COMPAT_BASE_URL;
  }
  return OPENAI_COMPAT_BASE_URL;
}

function buildOpenAICompatibleUrl(baseUrl: string, endpoint: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (normalizedBase.endsWith("/v1")) {
    return `${normalizedBase}/${endpoint}`;
  }
  return `${normalizedBase}/v1/${endpoint}`;
}

export interface ModelRouterData {
  providers: ProviderConfig[];
  models: ModelConfig[];
  defaultModel: string;
}

/** State passed to the onSave callback so the consumer can persist it. */
export interface RouterState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  defaultModel: string;
  activeModel: string;
}

export class ModelRouter {
  private providers: ProviderConfig[];
  private models: ModelConfig[];
  private defaultModelName: string;
  private activeModelName: string;
  private secrets: SecretsFile | null;
  private onSave: ((state: RouterState) => Promise<void>) | null;

  /** Tier → model name mapping */
  private tierModels: Record<ModelTier, string>;
  /** Task → tier overrides */
  private taskTierOverrides: Partial<Record<TaskType, ModelTier>>;
  /** Alias → model name mapping */
  private aliases: Record<string, string>;

  private constructor(
    data: ModelRouterData,
    secrets: SecretsFile | null,
    onSave: ((state: RouterState) => Promise<void>) | null,
    runtimeConfig?: Partial<Pick<RuntimeConfig, "modelTiers" | "taskTierOverrides" | "modelAliases">>,
  ) {
    this.providers = [...data.providers];
    this.models = [...data.models];
    this.defaultModelName = data.defaultModel;
    this.activeModelName = data.defaultModel;
    this.secrets = secrets;
    this.onSave = onSave;

    // Initialize tiers — default all to active model
    this.tierModels = {
      performance: data.defaultModel,
      normal: data.defaultModel,
      eco: data.defaultModel,
      ...runtimeConfig?.modelTiers,
    };
    this.taskTierOverrides = runtimeConfig?.taskTierOverrides ?? {};
    this.aliases = runtimeConfig?.modelAliases ?? {};
  }

  /** Create a ModelRouter from config data (no file I/O) */
  static fromConfig(
    data: ModelRouterData,
    secrets?: SecretsFile | null,
    onSave?: (state: RouterState) => Promise<void>,
    runtimeConfig?: Partial<Pick<RuntimeConfig, "modelTiers" | "taskTierOverrides" | "modelAliases">>,
  ): ModelRouter {
    ModelRouter.validate(data);
    const router = new ModelRouter(data, secrets ?? null, onSave ?? null, runtimeConfig);
    router.validateFallbackChains();
    return router;
  }

  /** Validate model/provider configuration */
  private static validate(data: ModelRouterData): void {
    if (!data.providers || data.providers.length === 0) {
      throw new Error("Config must contain at least one provider");
    }
    if (!data.models || data.models.length === 0) {
      throw new Error("Config must contain at least one model");
    }
    if (!data.defaultModel) {
      throw new Error("Config must specify a default model");
    }
    const names = data.models.map((m) => m.name);
    if (!names.includes(data.defaultModel)) {
      throw new Error(
        `Default model "${data.defaultModel}" not found in models list`
      );
    }
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      throw new Error("Duplicate model names in config");
    }
    const providerIds = new Set(data.providers.map((p) => p.id));
    for (const model of data.models) {
      if (!providerIds.has(model.provider)) {
        throw new Error(
          `Model "${model.name}" references unknown provider "${model.provider}"`
        );
      }
    }
  }

  /** Resolve an API key: env var takes precedence, then secrets file. */
  private resolveApiKey(envVar: string): string {
    const fromEnv = process.env[envVar];
    if (fromEnv) return fromEnv;
    const fromSecrets = this.secrets?.apiKeys[envVar];
    if (fromSecrets) return fromSecrets;
    const hint =
      process.platform === "darwin"
        ? ` (launchd services do not inherit shell env vars — use "aria onboard" to store in secrets.enc)`
        : "";
    throw new Error(
      `API key not found: set environment variable "${envVar}" or run "aria onboard" to store it in secrets.enc${hint}`
    );
  }

  /** Look up a ProviderConfig by ID */
  getProvider(id: string): ProviderConfig {
    const provider = this.providers.find((p) => p.id === id);
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
    if (provider.baseUrl || provider.type === "minimax") {
      const baseUrl = resolveOpenAICompatibleBaseUrl(provider);
      return {
        id: cfg.model,
        name: cfg.model,
        api: "openai-completions" as const,
        provider: provider.type,
        baseUrl,
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: cfg.maxTokens ?? 4096,
      } as Model<Api>;
    }
    return (getModel as (p: string, m: string) => Model<Api>)(
      provider.type,
      cfg.model
    );
  }

  /** Get the raw ModelConfig for the active (or named) model */
  getConfig(name?: string): ModelConfig {
    const target = name ?? this.activeModelName;
    const cfg = this.models.find((m) => m.name === target);
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
    thinking?: { enabled: boolean };
  } {
    const cfg = this.getConfig(name);
    const provider = this.getProvider(cfg.provider);
    const apiKey = this.resolveApiKey(provider.apiKeyEnvVar);
    const opts: {
      temperature?: number;
      maxTokens?: number;
      apiKey: string;
      thinking?: { enabled: boolean };
    } = {
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      apiKey,
    };
    // Gemini 3 models require explicit thinking config for reliable thought signatures
    // on function calls. Without it, replayed function calls may lack signatures and
    // trigger 400 "Invalid Input" errors.
    if (provider.type === "google" && cfg.model.includes("gemini-3")) {
      opts.thinking = { enabled: true };
    }
    return opts;
  }

  /** List all configured model names */
  listModels(): string[] {
    return this.models.map((m) => m.name);
  }

  /** List all model configs */
  listModelConfigs(): ModelConfig[] {
    return [...this.models];
  }

  /** List all configured providers */
  listProviders(): ProviderConfig[] {
    return [...this.providers];
  }

  /** Get the currently active model name */
  getActiveModelName(): string {
    return this.activeModelName;
  }

  /** Switch the active model */
  async switchModel(name: string): Promise<void> {
    const exists = this.models.some((m) => m.name === name);
    if (!exists) {
      throw new Error(`Model "${name}" not found`);
    }
    this.activeModelName = name;
    await this.save();
  }

  /** Add a new model configuration */
  async addModel(config: ModelConfig): Promise<void> {
    if (this.models.some((m) => m.name === config.name)) {
      throw new Error(`Model "${config.name}" already exists`);
    }
    if (!this.providers.some((p) => p.id === config.provider)) {
      throw new Error(`Provider "${config.provider}" not found`);
    }
    this.models.push(config);
    await this.save();
  }

  /** Remove a model configuration by name */
  async removeModel(name: string): Promise<void> {
    const idx = this.models.findIndex((m) => m.name === name);
    if (idx === -1) {
      throw new Error(`Model "${name}" not found`);
    }
    if (this.defaultModelName === name) {
      throw new Error(`Cannot remove the default model "${name}"`);
    }
    this.models.splice(idx, 1);
    if (this.activeModelName === name) {
      this.activeModelName = this.defaultModelName;
    }
    await this.save();
  }

  /** Add a new provider configuration */
  async addProvider(provider: ProviderConfig): Promise<void> {
    if (this.providers.some((p) => p.id === provider.id)) {
      throw new Error(`Provider "${provider.id}" already exists`);
    }
    this.providers.push(provider);
    await this.save();
  }

  /** Remove a provider configuration by ID */
  async removeProvider(id: string): Promise<void> {
    const idx = this.providers.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Provider "${id}" not found`);
    }
    const referencedBy = this.models.filter((m) => m.provider === id).map((m) => m.name);
    if (referencedBy.length > 0) {
      throw new Error(
        `Cannot remove provider "${id}" — still referenced by model(s): ${referencedBy.join(", ")}`
      );
    }
    this.providers.splice(idx, 1);
    await this.save();
  }

  /** Resolve an alias to a model name (returns input if not an alias) */
  resolveAlias(name: string): string {
    return this.aliases[name] ?? name;
  }

  /** Get the model name assigned to a tier */
  getTierModel(tier: ModelTier): string {
    return this.tierModels[tier] ?? this.activeModelName;
  }

  /** Get the current tier-to-model mapping */
  getTierConfig(): Record<ModelTier, string> {
    return { ...this.tierModels };
  }

  /** Update a tier's model assignment */
  async setTierModel(tier: ModelTier, modelName: string): Promise<void> {
    const resolved = this.resolveAlias(modelName);
    if (!this.models.some((m) => m.name === resolved)) {
      throw new Error(`Model "${resolved}" not found`);
    }
    this.tierModels[tier] = resolved;
  }

  /** Get PI-mono Model for a specific task type (resolves task → tier → model) */
  getModelForTask(task: TaskType): Model<Api> {
    const tier = this.taskTierOverrides[task] ?? DEFAULT_TASK_TIER[task] ?? "normal";
    return this.getModelForTier(tier);
  }

  /** Get PI-mono Model for a specific tier */
  getModelForTier(tier: ModelTier): Model<Api> {
    const modelName = this.tierModels[tier] ?? this.activeModelName;
    return this.getModel(modelName);
  }

  /** Get streaming options for a specific task type */
  getStreamOptionsForTask(task: TaskType): {
    temperature?: number;
    maxTokens?: number;
    apiKey: string;
    thinking?: { enabled: boolean };
  } {
    const tier = this.taskTierOverrides[task] ?? DEFAULT_TASK_TIER[task] ?? "normal";
    const modelName = this.tierModels[tier] ?? this.activeModelName;
    return this.getStreamOptions(modelName);
  }

  /** Get full routing state for tRPC queries */
  getRoutingState(): {
    tiers: Record<ModelTier, string>;
    aliases: Record<string, string>;
    activeModel: string;
    defaultModel: string;
  } {
    return {
      tiers: { ...this.tierModels },
      aliases: { ...this.aliases },
      activeModel: this.activeModelName,
      defaultModel: this.defaultModelName,
    };
  }

  /** Validate that fallback chains don't have circular references or missing targets */
  private validateFallbackChains(): void {
    const modelNames = new Set(this.models.map((m) => m.name));
    for (const model of this.models) {
      if (!model.fallback) continue;
      if (!modelNames.has(model.fallback)) {
        throw new Error(
          `Model "${model.name}" has fallback "${model.fallback}" which does not exist`
        );
      }
      // Detect circular chains
      const visited = new Set<string>();
      let current: string | undefined = model.name;
      while (current) {
        if (visited.has(current)) {
          throw new Error(
            `Circular fallback chain detected involving model "${current}"`
          );
        }
        visited.add(current);
        const cfg = this.models.find((m) => m.name === current);
        current = cfg?.fallback;
      }
    }
  }

  /** Get model with fallback — tries the primary model, falls back on provider error */
  getModelWithFallback(name?: string): { model: Model<Api>; options: { temperature?: number; maxTokens?: number; apiKey: string }; fallbackName?: string } {
    const target = name ?? this.activeModelName;
    try {
      return {
        model: this.getModel(target),
        options: this.getStreamOptions(target),
      };
    } catch (err) {
      const cfg = this.getConfig(target);
      if (cfg.fallback) {
        try {
          return {
            model: this.getModel(cfg.fallback),
            options: this.getStreamOptions(cfg.fallback),
            fallbackName: cfg.fallback,
          };
        } catch {
          // Fallback also failed — throw the original error
        }
      }
      throw err;
    }
  }

  // --- Embedding support ---

  /** Get the first model configured with type: "embedding", or null */
  getEmbeddingConfig(): ModelConfig | null {
    return this.models.find((m) => m.type === "embedding") ?? null;
  }

  /** Check if an embedding model is configured */
  hasEmbedding(): boolean {
    return this.getEmbeddingConfig() !== null;
  }

  /**
   * Embed texts using the configured embedding model.
   * Dispatches to the provider-specific embedding API endpoint.
   * Throws if no embedding model is configured or the API call fails.
   */
  async embed(texts: string[]): Promise<{ vectors: number[][]; dimensions: number }> {
    const cfg = this.getEmbeddingConfig();
    if (!cfg) throw new Error("No embedding model configured");

    const provider = this.getProvider(cfg.provider);
    const apiKey = this.resolveApiKey(provider.apiKeyEnvVar);

    // Dispatch based on provider type
    const providerType = provider.type as string;
    if (providerType === "google" || providerType === "google-vertex") {
      return this.embedGoogle(cfg.model, apiKey, texts, provider.baseUrl);
    }
    // OpenAI-compatible: openai, openrouter, nvidia, openai-compat, minimax, etc.
    const baseUrl =
      provider.baseUrl ?? (providerType === "minimax" ? MINIMAX_OPENAI_COMPAT_BASE_URL : undefined);
    return this.embedOpenAI(cfg.model, apiKey, texts, baseUrl);
  }

  /** Call OpenAI-compatible /v1/embeddings endpoint */
  private async embedOpenAI(
    model: string,
    apiKey: string,
    texts: string[],
    baseUrl?: string,
  ): Promise<{ vectors: number[][]; dimensions: number }> {
    const url = buildOpenAICompatibleUrl(baseUrl ?? OPENAI_COMPAT_BASE_URL, "embeddings");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding API error (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    const sorted = json.data.sort((a, b) => a.index - b.index);
    const vectors = sorted.map((d) => d.embedding);
    const dimensions = vectors[0]?.length ?? 0;
    return { vectors, dimensions };
  }

  /** Call Google Gemini embedding endpoint */
  private async embedGoogle(
    model: string,
    apiKey: string,
    texts: string[],
    baseUrl?: string,
  ): Promise<{ vectors: number[][]; dimensions: number }> {
    const base = baseUrl ?? "https://generativelanguage.googleapis.com";
    // Gemini batch embed endpoint
    const url = `${base}/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
    const requests = texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
    }));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini embedding API error (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      embeddings: Array<{ values: number[] }>;
    };
    const vectors = json.embeddings.map((e) => e.values);
    const dimensions = vectors[0]?.length ?? 0;
    return { vectors, dimensions };
  }

  private async save(): Promise<void> {
    if (this.onSave) {
      await this.onSave({
        providers: this.providers,
        models: this.models,
        defaultModel: this.defaultModelName,
        activeModel: this.activeModelName,
      });
    }
  }
}
