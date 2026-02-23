import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { fetchModelList, lookupModelMeta } from "./fetch-models.js";

type Substep = "provider" | "credentials" | "fetching" | "model";
type CompatField = "name" | "baseUrl" | "apiKey";

export interface ProviderOption {
  id: string;
  type: string;
  label: string;
  apiKeyEnvVar: string;
  baseUrl?: string;
  /** Pre-filled API key — if set, credentials step is skipped */
  apiKey?: string;
}

export interface ModelPickerResult {
  providerId: string;
  providerType: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
}

interface ModelPickerProps {
  title: string;
  description?: string;
  providers: ProviderOption[];
  onComplete: (result: ModelPickerResult) => void;
  onBack: () => void;
}

const VISIBLE_MODELS = 8;

export function ModelPicker({ title, description, providers, onComplete, onBack }: ModelPickerProps) {
  const [substep, setSubstep] = useState<Substep>("provider");
  const [providerIdx, setProviderIdx] = useState(0);

  // Credentials state (for new providers without pre-filled apiKey)
  const [compatField, setCompatField] = useState<CompatField>("name");
  const [customName, setCustomName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Model selection state
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [manualModel, setManualModel] = useState("");

  const provider = providers[providerIdx];
  const isCompat = provider?.type === "openai-compat";
  const hasApiKey = !!provider?.apiKey;

  // Trigger model fetch
  useEffect(() => {
    if (substep !== "fetching") return;
    const resolvedKey = hasApiKey ? provider.apiKey! : apiKey;
    const resolvedUrl = isCompat ? baseUrl : (provider?.baseUrl ?? "");
    fetchModelList(
      provider.type as "anthropic" | "openai" | "google" | "openrouter" | "nvidia" | "openai-compat",
      resolvedKey,
      resolvedUrl,
    )
      .then((models) => {
        setFetchedModels(models);
        setFetchError(null);
      })
      .catch((err: unknown) => {
        setFetchedModels([]);
        setFetchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setSelectedModelIdx(0);
        setScrollOffset(0);
        setManualModel("");
        setSubstep("model");
      });
  }, [substep]);

  function completeSelection(chosenModel: string) {
    const finalProviderId = isCompat && !hasApiKey ? customName : provider.id;
    const finalEnvVar = isCompat && !hasApiKey
      ? `${customName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`
      : provider.apiKeyEnvVar;
    const meta = lookupModelMeta(provider.type, chosenModel);
    onComplete({
      providerId: finalProviderId,
      providerType: provider.type,
      model: chosenModel,
      apiKeyEnvVar: finalEnvVar,
      apiKey: hasApiKey ? provider.apiKey! : apiKey,
      baseUrl: isCompat ? (hasApiKey ? provider.baseUrl : baseUrl) : undefined,
      maxTokens: meta?.maxTokens,
    });
  }

  useInput((input, key) => {
    // -- PROVIDER --
    if (substep === "provider") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setProviderIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setProviderIdx((i) => Math.min(providers.length - 1, i + 1)); return; }
      if (key.return) {
        const p = providers[providerIdx];
        if (p.apiKey) {
          // Pre-filled key — skip credentials
          setApiKey(p.apiKey);
          setBaseUrl(p.baseUrl ?? "");
          setSubstep("fetching");
        } else {
          // Need credentials
          setApiKey("");
          setCustomName("");
          setBaseUrl("");
          setCompatField("name");
          setSubstep("credentials");
        }
        return;
      }
    }

    // -- CREDENTIALS --
    if (substep === "credentials") {
      if (key.escape) { setSubstep("provider"); return; }

      if (!isCompat) {
        if (key.return) { setSubstep("fetching"); return; }
        if (key.backspace || key.delete) { setApiKey((v) => v.slice(0, -1)); return; }
        if (input && !key.ctrl && !key.meta) { setApiKey((v) => v + input); }
        return;
      }

      // OpenAI-compat: sequential fields
      if (key.return) {
        if (compatField === "name") { setCompatField("baseUrl"); return; }
        if (compatField === "baseUrl") { setCompatField("apiKey"); return; }
        setSubstep("fetching");
        return;
      }
      if (key.backspace || key.delete) {
        if (compatField === "name") setCustomName((v) => v.slice(0, -1));
        else if (compatField === "baseUrl") setBaseUrl((v) => v.slice(0, -1));
        else setApiKey((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        if (compatField === "name") setCustomName((v) => v + input);
        else if (compatField === "baseUrl") setBaseUrl((v) => v + input);
        else setApiKey((v) => v + input);
      }
      return;
    }

    // -- FETCHING -- (no input)
    if (substep === "fetching") return;

    // -- MODEL --
    if (substep === "model") {
      if (key.escape) {
        setSubstep(hasApiKey ? "provider" : "credentials");
        return;
      }

      if (fetchedModels.length > 0) {
        if (key.upArrow) {
          setSelectedModelIdx((i) => {
            const next = Math.max(0, i - 1);
            setScrollOffset((off) => Math.min(off, next));
            return next;
          });
          return;
        }
        if (key.downArrow) {
          setSelectedModelIdx((i) => {
            const next = Math.min(fetchedModels.length - 1, i + 1);
            setScrollOffset((off) =>
              next >= off + VISIBLE_MODELS ? next - VISIBLE_MODELS + 1 : off
            );
            return next;
          });
          return;
        }
        if (key.return) {
          completeSelection(fetchedModels[selectedModelIdx]);
          return;
        }
      } else {
        // Manual entry
        if (key.return) {
          if (manualModel.trim()) completeSelection(manualModel.trim());
          return;
        }
        if (key.backspace || key.delete) { setManualModel((v) => v.slice(0, -1)); return; }
        if (input && !key.ctrl && !key.meta) { setManualModel((v) => v + input); }
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      {description && <Text dimColor>{description}</Text>}
      <Text />

      {substep === "provider" && (
        <>
          <Text>Select provider:</Text>
          {providers.map((p, i) => (
            <Box key={p.id + i}>
              <Text color={i === providerIdx ? "cyan" : undefined} bold={i === providerIdx}>
                {i === providerIdx ? "● " : "○ "}
                {p.label}
              </Text>
            </Box>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
        </>
      )}

      {substep === "credentials" && (
        <>
          <Text bold>Provider: {provider.label}</Text>
          <Text />
          {isCompat ? (
            <>
              <Box>
                <Text color={compatField === "name" ? "blue" : "white"} bold={compatField === "name"}>
                  Name:{" "}
                </Text>
                <Text>{customName}</Text>
                {compatField === "name" && <Text color="blue">▊</Text>}
              </Box>
              <Box>
                <Text color={compatField === "baseUrl" ? "blue" : "white"} bold={compatField === "baseUrl"}>
                  Base URL:{" "}
                </Text>
                <Text>{baseUrl}</Text>
                {compatField === "baseUrl" && <Text color="blue">▊</Text>}
              </Box>
              <Box>
                <Text color={compatField === "apiKey" ? "blue" : "white"} bold={compatField === "apiKey"}>
                  API Key:{" "}
                </Text>
                <Text>{"•".repeat(Math.min(apiKey.length, 40))}</Text>
                {compatField === "apiKey" && <Text color="blue">▊</Text>}
              </Box>
              <Text />
              <Text dimColor>Enter to proceed | Esc back</Text>
            </>
          ) : (
            <>
              <Box>
                <Text color="blue">API Key ({provider.apiKeyEnvVar}): </Text>
                <Text>{"•".repeat(Math.min(apiKey.length, 40))}</Text>
                <Text color="blue">▊</Text>
              </Box>
              <Text />
              <Text dimColor>Leave empty to set the env var yourself later.</Text>
              <Text dimColor>Enter to continue | Esc back</Text>
            </>
          )}
        </>
      )}

      {substep === "fetching" && (
        <Text>Fetching available models from {provider.label}...</Text>
      )}

      {substep === "model" && (
        <>
          {fetchedModels.length > 0 ? (
            <>
              <Text>Choose a model ({fetchedModels.length} available):</Text>
              {fetchedModels.slice(scrollOffset, scrollOffset + VISIBLE_MODELS).map((m, i) => {
                const absIdx = scrollOffset + i;
                return (
                  <Box key={m}>
                    <Text
                      color={absIdx === selectedModelIdx ? "cyan" : undefined}
                      bold={absIdx === selectedModelIdx}
                    >
                      {absIdx === selectedModelIdx ? "● " : "○ "}
                      {m}
                    </Text>
                  </Box>
                );
              })}
              {fetchedModels.length > VISIBLE_MODELS && (
                <Text dimColor>
                  {scrollOffset > 0 ? "↑ " : "  "}
                  {selectedModelIdx + 1}/{fetchedModels.length}
                  {scrollOffset + VISIBLE_MODELS < fetchedModels.length ? " ↓" : "  "}
                </Text>
              )}
              <Text />
              <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
            </>
          ) : (
            <>
              {fetchError && (
                <Text dimColor>Could not fetch models: {fetchError}</Text>
              )}
              <Text>Enter model ID manually:</Text>
              <Box>
                <Text color="blue">Model: </Text>
                <Text>{manualModel}</Text>
                <Text color="blue">▊</Text>
              </Box>
              <Text />
              <Text dimColor>Enter to confirm | Esc back</Text>
            </>
          )}
        </>
      )}
    </Box>
  );
}

/** Default provider options for new setup (wizard) */
export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "anthropic", type: "anthropic", label: "Anthropic (official)", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
  { id: "openai", type: "openai", label: "OpenAI (official)", apiKeyEnvVar: "OPENAI_API_KEY" },
  { id: "google", type: "google", label: "Google (official)", apiKeyEnvVar: "GOOGLE_AI_API_KEY" },
  { id: "openrouter", type: "openrouter", label: "OpenRouter", apiKeyEnvVar: "OPENROUTER_API_KEY" },
  { id: "nvidia", type: "nvidia", label: "Nvidia NIM", apiKeyEnvVar: "NVIDIA_API_KEY" },
  { id: "openai-compat", type: "openai-compat", label: "OpenAI compatible", apiKeyEnvVar: "" },
];
