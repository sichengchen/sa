import { getModels } from "@mariozechner/pi-ai";
import type { KnownProvider } from "@mariozechner/pi-ai";

type ProviderType = "anthropic" | "openai" | "google" | "openrouter" | "nvidia" | "openai-compat";

/** Fetch available model IDs from a provider's API. */
export async function fetchModelList(
  providerType: ProviderType,
  apiKey: string,
  baseUrl: string,
): Promise<string[]> {
  if (providerType === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models", {
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
    return json.models
      .map((m) => m.name.replace(/^models\//, ""))
      .sort();
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
  const url = baseUrl.replace(/\/$/, "");
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
): { maxTokens: number } | null {
  try {
    const models = (getModels as (p: string) => { id: string; maxTokens: number }[])(
      providerType,
    );
    const match = models.find((m) => m.id === modelId);
    if (match) {
      return { maxTokens: match.maxTokens };
    }
  } catch {
    // Provider not known to PI-mono
  }
  return null;
}
