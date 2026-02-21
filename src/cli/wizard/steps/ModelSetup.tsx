import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { fetchModelList, lookupModelMeta } from "../../shared/fetch-models.js";

type ProviderType = "anthropic" | "openai" | "google" | "openrouter" | "nvidia" | "openai-compat";
type Substep = "keep-or-change" | "provider" | "credentials" | "fetching" | "model";
type CompatField = "name" | "baseUrl" | "apiKey";

const PROVIDER_OPTIONS: { type: ProviderType; label: string; apiKeyEnvVar: string }[] = [
  { type: "anthropic", label: "Anthropic (official)", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
  { type: "openai", label: "OpenAI (official)", apiKeyEnvVar: "OPENAI_API_KEY" },
  { type: "google", label: "Google (official)", apiKeyEnvVar: "GOOGLE_AI_API_KEY" },
  { type: "openrouter", label: "OpenRouter", apiKeyEnvVar: "OPENROUTER_API_KEY" },
  { type: "nvidia", label: "Nvidia NIM", apiKeyEnvVar: "NVIDIA_API_KEY" },
  { type: "openai-compat", label: "OpenAI compatible", apiKeyEnvVar: "" },
];

const VISIBLE_MODELS = 8;

export interface ModelSetupData {
  /** Provider unique ID (e.g. "anthropic", "openai", or custom compat name) */
  providerId: string;
  /** Provider type for pi-ai (e.g. "anthropic", "openai", "google", "openai-compat") */
  providerType: string;
  /** Model type alias kept for backward compat display (same as providerType for officials) */
  provider: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
  baseUrl?: string;
  /** Max output tokens from PI-mono model metadata (if available) */
  maxTokens?: number;
}

interface ModelSetupProps {
  onNext: (data: ModelSetupData) => void;
  onBack: () => void;
  currentValues?: ModelSetupData;
}

export function ModelSetup({ onNext, onBack, currentValues }: ModelSetupProps) {
  const [substep, setSubstep] = useState<Substep>(
    currentValues ? "keep-or-change" : "provider"
  );
  const [providerIdx, setProviderIdx] = useState(0);

  // Credentials state
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

  const providerOption = PROVIDER_OPTIONS[providerIdx];
  const isCompat = providerOption.type === "openai-compat";

  // Trigger model fetch when entering "fetching" substep
  useEffect(() => {
    if (substep !== "fetching") return;
    fetchModelList(providerOption.type, apiKey, baseUrl)
      .then((models) => {
        setFetchedModels(models);
        setFetchError(null);
      })
      .catch((err: unknown) => {
        setFetchedModels([]);
        setFetchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setSubstep("model");
      });
  }, [substep]); // intentionally only re-runs when substep changes to "fetching"

  function completeSetup(chosenModel: string) {
    const finalProviderId = isCompat ? customName : providerOption.type;
    const finalProviderType = providerOption.type;
    const finalEnvVar = isCompat
      ? `${customName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`
      : providerOption.apiKeyEnvVar;
    const meta = lookupModelMeta(finalProviderType, chosenModel);
    onNext({
      providerId: finalProviderId,
      providerType: finalProviderType,
      provider: finalProviderId,
      model: chosenModel,
      apiKeyEnvVar: finalEnvVar,
      apiKey,
      baseUrl: isCompat ? baseUrl : undefined,
      maxTokens: meta?.maxTokens,
    });
  }

  useInput((input, key) => {
    // ── keep-or-change substep ────────────────────────────────────────────
    if (substep === "keep-or-change") {
      if (key.escape) { onBack(); return; }
      if (input?.toLowerCase() === "k" && currentValues) {
        onNext(currentValues);
        return;
      }
      if (input?.toLowerCase() === "c") {
        setSubstep("provider");
        return;
      }
      return;
    }

    // ── provider substep ──────────────────────────────────────────────────
    if (substep === "provider") {
      if (key.escape) {
        if (currentValues) { setSubstep("keep-or-change"); return; }
        onBack();
        return;
      }
      if (key.upArrow) { setProviderIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) {
        setProviderIdx((i) => Math.min(PROVIDER_OPTIONS.length - 1, i + 1));
        return;
      }
      if (key.return) {
        // Reset credential fields when switching providers
        setApiKey("");
        setCustomName("");
        setBaseUrl("");
        setCompatField("name");
        setSubstep("credentials");
        return;
      }
    }

    // ── credentials substep ───────────────────────────────────────────────
    if (substep === "credentials") {
      if (key.escape) { setSubstep("provider"); return; }

      if (!isCompat) {
        // Official: single API key field
        if (key.return) { setSubstep("fetching"); return; }
        if (key.backspace || key.delete) { setApiKey((v) => v.slice(0, -1)); return; }
        if (input && !key.ctrl && !key.meta) { setApiKey((v) => v + input); }
        return;
      }

      // OpenAI-compat: sequential fields
      if (key.return) {
        if (compatField === "name") { setCompatField("baseUrl"); return; }
        if (compatField === "baseUrl") { setCompatField("apiKey"); return; }
        // apiKey field — advance to fetching
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
    }

    // ── fetching substep — no keyboard ────────────────────────────────────
    if (substep === "fetching") return;

    // ── model substep ─────────────────────────────────────────────────────
    if (substep === "model") {
      if (key.escape) { setSubstep("credentials"); return; }

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
          completeSetup(fetchedModels[selectedModelIdx]);
          return;
        }
      } else {
        // Manual entry fallback
        if (key.return) {
          if (manualModel.trim()) completeSetup(manualModel.trim());
          return;
        }
        if (key.backspace || key.delete) { setManualModel((v) => v.slice(0, -1)); return; }
        if (input && !key.ctrl && !key.meta) { setManualModel((v) => v + input); }
      }
    }
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Model Setup
      </Text>
      <Text />

      {substep === "keep-or-change" && currentValues && (
        <>
          <Text>Current configuration:</Text>
          <Text>  Provider: {currentValues.provider}</Text>
          <Text>  Model: {currentValues.model}</Text>
          <Text>
            {"  "}API Key: {currentValues.apiKey ? "••••••••" : "(not set)"}{" "}
            ({currentValues.apiKeyEnvVar})
          </Text>
          {currentValues.baseUrl && (
            <Text>  Base URL: {currentValues.baseUrl}</Text>
          )}
          <Text />
          <Text>
            <Text color="yellow" bold>[K]</Text> Keep current{"  "}
            <Text color="yellow" bold>[C]</Text> Change{"    "}
            <Text dimColor>Esc to go back</Text>
          </Text>
        </>
      )}

      {substep === "provider" && (
        <>
          <Text>Select your LLM provider:</Text>
          {PROVIDER_OPTIONS.map((p, i) => (
            <Box key={p.type}>
              <Text color={i === providerIdx ? "cyan" : undefined} bold={i === providerIdx}>
                {i === providerIdx ? "● " : "○ "}
                {p.label}
              </Text>
            </Box>
          ))}
          <Text />
          <Text dimColor>↑↓ to navigate | Enter to select | Esc to go back</Text>
        </>
      )}

      {substep === "credentials" && (
        <>
          <Text bold>Provider: {providerOption.label}</Text>
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
              <Text dimColor>Enter to proceed to next field | Esc to go back</Text>
            </>
          ) : (
            <>
              <Box>
                <Text color="blue">API Key ({providerOption.apiKeyEnvVar}): </Text>
                <Text>{"•".repeat(Math.min(apiKey.length, 40))}</Text>
                <Text color="blue">▊</Text>
              </Box>
              <Text />
              <Text dimColor>Leave empty to set the env var yourself later.</Text>
              <Text dimColor>Enter to continue | Esc to go back</Text>
            </>
          )}
        </>
      )}

      {substep === "fetching" && (
        <>
          <Text>Fetching available models from {providerOption.label}...</Text>
        </>
      )}

      {substep === "model" && (
        <>
          {fetchedModels.length > 0 ? (
            <>
              <Text>
                Choose a model ({fetchedModels.length} available):
              </Text>
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
              <Text dimColor>↑↓ to navigate | Enter to select | Esc to go back</Text>
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
              <Text dimColor>Enter to confirm | Esc to go back</Text>
            </>
          )}
        </>
      )}
    </Box>
  );
}
