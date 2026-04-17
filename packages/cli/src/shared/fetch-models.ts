import { getModels } from "@mariozechner/pi-ai";
import type { KnownProvider } from "@mariozechner/pi-ai";

type ProviderType = "anthropic" | "openai" | "google" | "openrouter" | "nvidia" | "openai-compat";

export const MINIMAX_PROVIDER_ID = "minimax";
export const MINIMAX_API_KEY_ENV_VAR = "MINIMAX_API_KEY";
export const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
export const MINIMAX_INTL_PROVIDER_ID = "minimax-intl";
export const MINIMAX_INTL_BASE_URL = "https://api.minimax.io/v1";
export const MINIMAX_ANTHROPIC_PROVIDER_ID = "minimax-anthropic";
export const MINIMAX_ANTHROPIC_BASE_URL = "https://api.minimaxi.com/anthropic";
export const MINIMAX_INTL_ANTHROPIC_PROVIDER_ID = "minimax-intl-anthropic";
export const MINIMAX_INTL_ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
export const MINIMAX_ANTHROPIC_PRESET_MODELS = [
  "MiniMax-M2.7",
  "MiniMax-M2.7-highspeed",
  "MiniMax-M2.5",
  "MiniMax-M2.5-highspeed",
  "MiniMax-M2.1",
  "MiniMax-M2.1-highspeed",
  "MiniMax-M2",
] as const;
const MINIMAX_MODEL_MAX_OUTPUT_TOKENS = 196_608;
const MINIMAX_MODEL_PREFIX = "MiniMax-";

function isMiniMaxOpenAICompatibleProvider(providerId?: string): boolean {
  return providerId === MINIMAX_PROVIDER_ID || providerId === MINIMAX_INTL_PROVIDER_ID;
}

function isMiniMaxAnthropicProvider(providerId?: string): boolean {
  return (
    providerId === MINIMAX_ANTHROPIC_PROVIDER_ID ||
    providerId === MINIMAX_INTL_ANTHROPIC_PROVIDER_ID
  );
}

function isMiniMaxProvider(providerId?: string): boolean {
  return isMiniMaxOpenAICompatibleProvider(providerId) || isMiniMaxAnthropicProvider(providerId);
}

export function getPresetModelList(
  providerType: ProviderType,
  providerId?: string,
): string[] | null {
  if (providerType === "anthropic" && isMiniMaxAnthropicProvider(providerId)) {
    return [...MINIMAX_ANTHROPIC_PRESET_MODELS];
  }
  return null;
}

/** Fetch available model IDs from a provider's API. */
export async function fetchModelList(
  providerType: ProviderType,
  apiKey: string,
  baseUrl: string,
  providerId?: string,
): Promise<string[]> {
  const presetModels = getPresetModelList(providerType, providerId);
  if (presetModels) {
    return presetModels;
  }
  if (providerType === "anthropic") {
    const url = (baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    const res = await fetch(`${url.endsWith("/v1") ? url : `${url}/v1`}/models`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data: { id: string }[] };
    return json.data.map((m) => m.id).sort();
  }
  if (providerType === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data: { id: string }[] };
    return json.data.map((m) => m.id).sort();
  }
  if (providerType === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { models: { name: string }[] };
    return json.models.map((m) => m.name.replace(/^models\//, "")).sort();
  }
  if (providerType === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data: { id: string }[] };
    return json.data.map((m) => m.id).sort();
  }
  if (providerType === "nvidia") {
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data: { id: string }[] };
    return json.data.map((m) => m.id).sort();
  }
  // openai-compat
  const resolvedBaseUrl =
    isMiniMaxOpenAICompatibleProvider(providerId) && !baseUrl
      ? providerId === MINIMAX_INTL_PROVIDER_ID
        ? MINIMAX_INTL_BASE_URL
        : MINIMAX_BASE_URL
      : baseUrl;
  const url = resolvedBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${url}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data: { id: string }[] };
  return json.data.map((m) => m.id).sort();
}

/** Look up PI-mono model metadata (maxTokens) for a provider + model ID.
 *  Returns null if the model isn't in PI-mono's registry (e.g. openai-compat). */
export function lookupModelMeta(
  providerType: string,
  modelId: string,
  providerId?: string,
): { maxTokens: number } | null {
  if (isMiniMaxProvider(providerId) && modelId.startsWith(MINIMAX_MODEL_PREFIX)) {
    return { maxTokens: MINIMAX_MODEL_MAX_OUTPUT_TOKENS };
  }
  try {
    const models = (getModels as (p: string) => { id: string; maxTokens: number }[])(providerType);
    const match = models.find((m) => m.id === modelId);
    if (match) {
      return { maxTokens: match.maxTokens };
    }
  } catch {
    // Provider not known to PI-mono
  }
  return null;
}
