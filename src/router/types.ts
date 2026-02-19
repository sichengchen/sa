import type { KnownProvider } from "@mariozechner/pi-ai";

export interface ModelConfig {
  /** Display name for this model configuration */
  name: string;
  /** LLM provider (e.g. "anthropic", "openai", "google") */
  provider: KnownProvider;
  /** Model ID within the provider (e.g. "claude-sonnet-4-5-20250514") */
  model: string;
  /** Environment variable name that holds the API key */
  apiKeyEnvVar: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Base URL for OpenAI-compatible providers with custom endpoints */
  baseUrl?: string;
}

export interface ModelsFile {
  /** Name of the default model config */
  default: string;
  /** Array of model configurations */
  models: ModelConfig[];
}
