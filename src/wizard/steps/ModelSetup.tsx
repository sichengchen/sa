import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

const PROVIDERS = ["anthropic", "openai", "google"] as const;
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-5-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
};
const API_KEY_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

export interface ModelSetupData {
  provider: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
}

interface ModelSetupProps {
  onNext: (data: ModelSetupData) => void;
  onBack: () => void;
}

export function ModelSetup({ onNext, onBack }: ModelSetupProps) {
  const [step, setStep] = useState<"provider" | "apikey">("provider");
  const [providerIdx, setProviderIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");

  const provider = PROVIDERS[providerIdx];

  useInput((input, key) => {
    if (key.escape) {
      if (step === "apikey") {
        setStep("provider");
      } else {
        onBack();
      }
      return;
    }

    if (step === "provider") {
      if (key.upArrow) setProviderIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setProviderIdx((i) => Math.min(PROVIDERS.length - 1, i + 1));
      if (key.return) setStep("apikey");
      return;
    }

    if (step === "apikey") {
      if (key.return) {
        onNext({
          provider,
          model: DEFAULT_MODELS[provider],
          apiKeyEnvVar: API_KEY_VARS[provider],
          apiKey,
        });
        return;
      }
      if (key.backspace || key.delete) {
        setApiKey((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setApiKey((v) => v + input);
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Model Setup
      </Text>
      <Text />

      {step === "provider" ? (
        <>
          <Text>Select your primary LLM provider:</Text>
          {PROVIDERS.map((p, i) => (
            <Box key={p}>
              <Text color={i === providerIdx ? "cyan" : undefined}>
                {i === providerIdx ? "❯ " : "  "}
                {p} ({DEFAULT_MODELS[p]})
              </Text>
            </Box>
          ))}
          <Text />
          <Text dimColor>↑↓ to navigate | Enter to select | Esc to go back</Text>
        </>
      ) : (
        <>
          <Text>
            Enter your {provider} API key (stored as env var{" "}
            {API_KEY_VARS[provider]}):
          </Text>
          <Box>
            <Text color="blue">API Key: </Text>
            <Text>{apiKey ? "•".repeat(Math.min(apiKey.length, 40)) : ""}</Text>
            <Text color="blue">{"▊"}</Text>
          </Box>
          <Text />
          <Text dimColor>
            Leave empty to set the env var yourself later. Enter to proceed | Esc
            to go back.
          </Text>
        </>
      )}
    </Box>
  );
}
