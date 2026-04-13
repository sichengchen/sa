import { describe } from "bun:test";
import { ModelRouter } from "@aria/gateway/router";
import type { KnownProvider } from "@mariozechner/pi-ai";

export type LiveProviderId = "anthropic" | "openai" | "google" | "minimax";

export interface LiveProviderSelection {
  providerId: LiveProviderId;
  providerType: KnownProvider;
  apiKeyEnvVar: string;
  modelName: string;
  modelId: string;
  baseUrl?: string;
}

type EnvMap = Record<string, string | undefined>;

const LIVE_PROVIDER_ORDER: readonly LiveProviderSelection[] = [
  {
    providerId: "anthropic",
    providerType: "anthropic" as KnownProvider,
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    modelName: "live-anthropic",
    modelId: "claude-3-5-haiku-20241022",
  },
  {
    providerId: "openai",
    providerType: "openai" as KnownProvider,
    apiKeyEnvVar: "OPENAI_API_KEY",
    modelName: "live-openai",
    modelId: "gpt-4o-mini",
  },
  {
    providerId: "google",
    providerType: "google" as KnownProvider,
    apiKeyEnvVar: "GOOGLE_AI_API_KEY",
    modelName: "live-google",
    modelId: "gemini-2.0-flash",
  },
  {
    providerId: "minimax",
    providerType: "minimax" as KnownProvider,
    apiKeyEnvVar: "MINIMAX_API_KEY",
    modelName: "live-minimax",
    modelId: "MiniMax-M2.5",
    baseUrl: "https://api.minimaxi.com/v1",
  },
] as const;

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function listAvailableLiveProviders(env: EnvMap = process.env): LiveProviderSelection[] {
  return LIVE_PROVIDER_ORDER.filter((provider) =>
    Boolean(normalizeEnvValue(env[provider.apiKeyEnvVar])),
  ).map((provider) => ({
    ...provider,
    modelId: normalizeEnvValue(env.ARIA_LIVE_MODEL) ?? provider.modelId,
  }));
}

export function resolveLiveProviderSelection(
  env: EnvMap = process.env,
): LiveProviderSelection | null {
  const requestedProvider = normalizeEnvValue(env.ARIA_LIVE_PROVIDER) as LiveProviderId | undefined;
  const availableProviders = listAvailableLiveProviders(env);

  if (requestedProvider) {
    return availableProviders.find((provider) => provider.providerId === requestedProvider) ?? null;
  }

  return availableProviders[0] ?? null;
}

/** True when a supported live API key is available for LLM tests */
export const LIVE = resolveLiveProviderSelection() !== null;

export function makeLiveRouter(
  selection: LiveProviderSelection | null = resolveLiveProviderSelection(),
): ModelRouter {
  if (!selection) {
    throw new Error(
      "makeLiveRouter() requires one of ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, or MINIMAX_API_KEY. " +
        "Optionally set ARIA_LIVE_PROVIDER to choose a specific provider.",
    );
  }

  return ModelRouter.fromConfig({
    defaultModel: selection.modelName,
    providers: [
      {
        id: selection.providerId,
        type: selection.providerType,
        apiKeyEnvVar: selection.apiKeyEnvVar,
        ...(selection.baseUrl ? { baseUrl: selection.baseUrl } : {}),
      },
    ],
    models: [
      {
        name: selection.modelName,
        provider: selection.providerId,
        model: selection.modelId,
        temperature: 0,
        maxTokens: 128,
      },
    ],
  });
}

export function getLiveTestLabel(
  selection: LiveProviderSelection | null = resolveLiveProviderSelection(),
): string {
  return selection ? `${selection.providerId}:${selection.modelId}` : "no-live-provider";
}

/** Wrapper around describe.if(LIVE) for live LLM tests. */
export const describeLive: typeof describe = describe.if(LIVE) as typeof describe;
