import type { KnownProvider } from "@mariozechner/pi-ai";

/** Provider kinds supported by Aria's router layer. */
export type ProviderType = KnownProvider | "minimax";

export interface ProviderConfig {
  /** Unique ID for this provider configuration */
  id: string;
  /** LLM provider type (e.g. "anthropic", "openai", "openrouter", "minimax") */
  type: ProviderType;
  /** Environment variable name that holds the API key */
  apiKeyEnvVar: string;
  /** Base URL for OpenAI-compatible providers with custom endpoints */
  baseUrl?: string;
}

export interface ModelConfig {
  /** Display name for this model configuration */
  name: string;
  /** Provider ID (references ProviderConfig.id) */
  provider: string;
  /** Model ID within the provider (e.g. "claude-sonnet-4-5-20250514") */
  model: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Fallback model name to use when this model's provider fails */
  fallback?: string;
  /** Model type: "chat" (default) or "embedding" for vector search */
  type?: "chat" | "embedding";
}
