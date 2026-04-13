import { describe, test, expect } from "bun:test";
import type { ModelTier } from "@aria/gateway/router/task-types";
import type { ModelConfig, ProviderConfig } from "@aria/gateway/router/types";

/**
 * Tests for wizard save logic — multi-model config generation.
 *
 * The wizard builds providers[], models[], and modelTiers from WizardData.
 * We extract the logic into a pure function to test it without rendering React components.
 */

interface WizardModelInput {
  providerId: string;
  providerType: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
}

interface WizardConfigResult {
  providers: ProviderConfig[];
  models: ModelConfig[];
  modelTiers?: Partial<Record<ModelTier, string>>;
  defaultModel: string;
}

/** Pure function that mirrors the wizard's save logic for config.json */
function buildWizardConfig(
  primary: WizardModelInput,
  eco?: WizardModelInput | null,
  embedding?: WizardModelInput | null,
): WizardConfigResult {
  const providerMap = new Map<string, ProviderConfig>();
  const models: ModelConfig[] = [];
  const modelTiers: Partial<Record<ModelTier, string>> = {};

  // Primary
  providerMap.set(primary.providerId, {
    id: primary.providerId,
    type: primary.providerType as ProviderConfig["type"],
    apiKeyEnvVar: primary.apiKeyEnvVar,
    ...(primary.baseUrl ? { baseUrl: primary.baseUrl } : {}),
  });
  models.push({
    name: "default",
    provider: primary.providerId,
    model: primary.model,
    temperature: 0.7,
    maxTokens: primary.maxTokens ?? 8192,
  });

  // Eco
  if (eco) {
    if (!providerMap.has(eco.providerId)) {
      providerMap.set(eco.providerId, {
        id: eco.providerId,
        type: eco.providerType as ProviderConfig["type"],
        apiKeyEnvVar: eco.apiKeyEnvVar,
        ...(eco.baseUrl ? { baseUrl: eco.baseUrl } : {}),
      });
    }
    models.push({
      name: "eco",
      provider: eco.providerId,
      model: eco.model,
      temperature: 0.7,
      maxTokens: eco.maxTokens ?? 4096,
    });
    modelTiers.eco = "eco";
  }

  // Embedding
  if (embedding) {
    if (!providerMap.has(embedding.providerId)) {
      providerMap.set(embedding.providerId, {
        id: embedding.providerId,
        type: embedding.providerType as ProviderConfig["type"],
        apiKeyEnvVar: embedding.apiKeyEnvVar,
        ...(embedding.baseUrl ? { baseUrl: embedding.baseUrl } : {}),
      });
    }
    models.push({
      name: "embedding",
      provider: embedding.providerId,
      model: embedding.model,
      type: "embedding",
    });
  }

  return {
    providers: Array.from(providerMap.values()),
    models,
    ...(Object.keys(modelTiers).length > 0 ? { modelTiers } : {}),
    defaultModel: "default",
  };
}

describe("wizard config generation", () => {
  test("primary model only — single provider and model", () => {
    const result = buildWizardConfig({
      providerId: "anthropic",
      providerType: "anthropic",
      model: "claude-sonnet-4-5-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      apiKey: "sk-test",
      maxTokens: 8192,
    });

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe("anthropic");
    expect(result.models).toHaveLength(1);
    expect(result.models[0].name).toBe("default");
    expect(result.modelTiers).toBeUndefined();
    expect(result.defaultModel).toBe("default");
  });

  test("primary + eco model on same provider — provider deduplicated", () => {
    const result = buildWizardConfig(
      {
        providerId: "anthropic",
        providerType: "anthropic",
        model: "claude-sonnet-4-5-20250514",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKey: "sk-test",
        maxTokens: 8192,
      },
      {
        providerId: "anthropic",
        providerType: "anthropic",
        model: "claude-haiku-3-5-20241022",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKey: "sk-test",
        maxTokens: 4096,
      },
    );

    expect(result.providers).toHaveLength(1);
    expect(result.models).toHaveLength(2);
    expect(result.models[0].name).toBe("default");
    expect(result.models[1].name).toBe("eco");
    expect(result.modelTiers).toEqual({ eco: "eco" });
  });

  test("primary + eco on different providers — both providers present", () => {
    const result = buildWizardConfig(
      {
        providerId: "anthropic",
        providerType: "anthropic",
        model: "claude-sonnet-4-5-20250514",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKey: "sk-ant",
      },
      {
        providerId: "openai",
        providerType: "openai",
        model: "gpt-4o-mini",
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKey: "sk-oai",
      },
    );

    expect(result.providers).toHaveLength(2);
    expect(result.providers.map((p) => p.id)).toEqual(["anthropic", "openai"]);
    expect(result.models).toHaveLength(2);
  });

  test("primary + embedding model — embedding has type field", () => {
    const result = buildWizardConfig(
      {
        providerId: "anthropic",
        providerType: "anthropic",
        model: "claude-sonnet-4-5-20250514",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKey: "sk-test",
      },
      null,
      {
        providerId: "openai",
        providerType: "openai",
        model: "text-embedding-3-small",
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKey: "sk-emb",
      },
    );

    expect(result.providers).toHaveLength(2);
    expect(result.models).toHaveLength(2);
    const embModel = result.models.find((m) => m.name === "embedding");
    expect(embModel).toBeDefined();
    expect(embModel!.type).toBe("embedding");
    expect(embModel!.provider).toBe("openai");
    // No temperature or maxTokens on embedding
    expect(embModel!.temperature).toBeUndefined();
    expect(result.modelTiers).toBeUndefined(); // No eco model
  });

  test("all three models — full setup", () => {
    const result = buildWizardConfig(
      {
        providerId: "anthropic",
        providerType: "anthropic",
        model: "claude-sonnet-4-5-20250514",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKey: "sk-ant",
        maxTokens: 8192,
      },
      {
        providerId: "anthropic",
        providerType: "anthropic",
        model: "claude-haiku-3-5-20241022",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        apiKey: "sk-ant",
        maxTokens: 4096,
      },
      {
        providerId: "openai",
        providerType: "openai",
        model: "text-embedding-3-small",
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKey: "sk-oai",
      },
    );

    expect(result.providers).toHaveLength(2); // anthropic + openai (deduplicated)
    expect(result.models).toHaveLength(3);
    expect(result.models.map((m) => m.name)).toEqual(["default", "eco", "embedding"]);
    expect(result.modelTiers).toEqual({ eco: "eco" });
    expect(result.models[2].type).toBe("embedding");
  });

  test("openai-compat provider with baseUrl", () => {
    const result = buildWizardConfig({
      providerId: "local-llm",
      providerType: "openai-compat",
      model: "llama-3.1-8b",
      apiKeyEnvVar: "LOCAL_LLM_API_KEY",
      apiKey: "key",
      baseUrl: "http://localhost:8080",
    });

    expect(result.providers[0].baseUrl).toBe("http://localhost:8080");
    expect(String(result.providers[0].type)).toBe("openai-compat");
  });

  test("MiniMax provider writes the official OpenAI-compatible defaults", () => {
    const result = buildWizardConfig({
      providerId: "minimax",
      providerType: "openai-compat",
      model: "MiniMax-M2.5",
      apiKeyEnvVar: "MINIMAX_API_KEY",
      apiKey: "key",
      baseUrl: "https://api.minimaxi.com/v1",
    });

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]).toMatchObject({
      id: "minimax",
      type: "openai-compat",
      apiKeyEnvVar: "MINIMAX_API_KEY",
      baseUrl: "https://api.minimaxi.com/v1",
    });
    expect(result.models[0]).toMatchObject({
      provider: "minimax",
      model: "MiniMax-M2.5",
    });
  });

  test("no eco model skips modelTiers", () => {
    const result = buildWizardConfig(
      {
        providerId: "openai",
        providerType: "openai",
        model: "gpt-4o",
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKey: "sk-test",
      },
      null,
      null,
    );

    expect(result.modelTiers).toBeUndefined();
    expect(result.models).toHaveLength(1);
  });

  test("embedding model reuses primary provider — provider not duplicated", () => {
    const result = buildWizardConfig(
      {
        providerId: "openai",
        providerType: "openai",
        model: "gpt-4o",
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKey: "sk-test",
      },
      null,
      {
        providerId: "openai",
        providerType: "openai",
        model: "text-embedding-3-small",
        apiKeyEnvVar: "OPENAI_API_KEY",
        apiKey: "sk-test",
      },
    );

    expect(result.providers).toHaveLength(1);
    expect(result.models).toHaveLength(2);
    expect(result.models[1].type).toBe("embedding");
  });
});
