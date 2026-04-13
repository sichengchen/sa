import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  ModelPicker,
  PROVIDER_OPTIONS,
  type ModelPickerResult,
  type ProviderOption,
} from "../../shared/ModelPicker.js";

type Phase = "keep-or-change" | "primary" | "ask-eco" | "eco" | "ask-embedding" | "embedding";

export interface ModelSetupData {
  /** Provider unique ID (e.g. "anthropic", "openai", or custom compat name) */
  providerId: string;
  /** Provider type for pi-ai (e.g. "anthropic", "openai", "google", "openai-compat") */
  providerType: string;
  /** Kept for display compatibility */
  provider: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
  baseUrl?: string;
  /** Max output tokens from PI-mono model metadata (if available) */
  maxTokens?: number;
  /** Optional eco model */
  ecoModel?: ModelPickerResult;
  /** Optional embedding model */
  embeddingModel?: ModelPickerResult;
}

interface ModelSetupProps {
  onNext: (data: ModelSetupData) => void;
  onBack: () => void;
  currentValues?: ModelSetupData;
}

export function ModelSetup({ onNext, onBack, currentValues }: ModelSetupProps) {
  const [phase, setPhase] = useState<Phase>(currentValues ? "keep-or-change" : "primary");
  const [primaryResult, setPrimaryResult] = useState<ModelPickerResult | null>(null);
  const [ecoResult, setEcoResult] = useState<ModelPickerResult | null>(null);

  function finish(
    primary: ModelPickerResult,
    eco?: ModelPickerResult | null,
    embedding?: ModelPickerResult | null,
  ) {
    onNext({
      providerId: primary.providerId,
      providerType: primary.providerType,
      provider: primary.providerId,
      model: primary.model,
      apiKeyEnvVar: primary.apiKeyEnvVar,
      apiKey: primary.apiKey,
      baseUrl: primary.baseUrl,
      maxTokens: primary.maxTokens,
      ecoModel: eco ?? undefined,
      embeddingModel: embedding ?? undefined,
    });
  }

  // Build provider options for eco/embedding that offer "Use same provider" as first option
  function buildReuseProviders(sourceResult: ModelPickerResult): ProviderOption[] {
    const reuse: ProviderOption = {
      id: sourceResult.providerId,
      type: sourceResult.providerType,
      label: `${sourceResult.providerId} (same provider)`,
      apiKeyEnvVar: sourceResult.apiKeyEnvVar,
      apiKey: sourceResult.apiKey,
      baseUrl: sourceResult.baseUrl,
    };
    // Add "same provider" at top, then all standard options (excluding duplicates)
    return [reuse, ...PROVIDER_OPTIONS.filter((p) => p.id !== sourceResult.providerId)];
  }

  // -- keep-or-change --
  if (phase === "keep-or-change" && currentValues) {
    return (
      <KeepOrChange
        currentValues={currentValues}
        onKeep={() => onNext(currentValues)}
        onChange={() => setPhase("primary")}
        onBack={onBack}
      />
    );
  }

  // -- primary model --
  if (phase === "primary") {
    return (
      <Box flexDirection="column" padding={1}>
        <ModelPicker
          title="Step 1: Primary Model"
          description="Your main AI model for conversations and tool use."
          providers={PROVIDER_OPTIONS}
          onComplete={(result) => {
            setPrimaryResult(result);
            setPhase("ask-eco");
          }}
          onBack={() => {
            if (currentValues) {
              setPhase("keep-or-change");
              return;
            }
            onBack();
          }}
        />
      </Box>
    );
  }

  // -- ask eco --
  if (phase === "ask-eco") {
    return (
      <AskYesNo
        title="Step 2: Eco Model (optional)"
        question="Add a lighter/cheaper model for simple tasks?"
        hint="Eco models handle classification, summarization, etc. at lower cost."
        onYes={() => setPhase("eco")}
        onNo={() => setPhase("ask-embedding")}
        onBack={() => setPhase("primary")}
      />
    );
  }

  // -- eco model --
  if (phase === "eco" && primaryResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <ModelPicker
          title="Step 2: Eco Model"
          description="A lighter model for simple tasks (classification, summarization)."
          providers={buildReuseProviders(primaryResult)}
          onComplete={(result) => {
            setEcoResult(result);
            setPhase("ask-embedding");
          }}
          onBack={() => setPhase("ask-eco")}
        />
      </Box>
    );
  }

  // -- ask embedding --
  if (phase === "ask-embedding") {
    return (
      <AskYesNo
        title="Step 3: Embedding Model (optional)"
        question="Add an embedding model for semantic memory search?"
        hint="Enables vector search in memory. Without it, memory uses keyword search only."
        onYes={() => setPhase("embedding")}
        onNo={() => finish(primaryResult!, ecoResult)}
        onBack={() => {
          if (ecoResult) setPhase("eco");
          else setPhase("ask-eco");
        }}
      />
    );
  }

  // -- embedding model --
  if (phase === "embedding" && primaryResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <ModelPicker
          title="Step 3: Embedding Model"
          description="Used for semantic memory search (e.g. text-embedding-3-small)."
          providers={buildReuseProviders(primaryResult)}
          onComplete={(result) => {
            finish(primaryResult, ecoResult, result);
          }}
          onBack={() => setPhase("ask-embedding")}
        />
      </Box>
    );
  }

  return null;
}

// Simple Y/N question component
function AskYesNo({
  title,
  question,
  hint,
  onYes,
  onNo,
  onBack,
}: {
  title: string;
  question: string;
  hint?: string;
  onYes: () => void;
  onNo: () => void;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    const lower = input?.toLowerCase();
    if (lower === "y" || key.return) {
      onYes();
      return;
    }
    if (lower === "n") {
      onNo();
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        {title}
      </Text>
      <Text />
      <Text>{question}</Text>
      {hint && <Text dimColor>{hint}</Text>}
      <Text />
      <Text>
        <Text color="yellow" bold>
          [Y]
        </Text>{" "}
        Yes{"  "}
        <Text color="yellow" bold>
          [N]
        </Text>{" "}
        No{"   "}
        <Text dimColor>Esc to go back</Text>
      </Text>
    </Box>
  );
}

// Keep-or-change component for re-setup
function KeepOrChange({
  currentValues,
  onKeep,
  onChange,
  onBack,
}: {
  currentValues: ModelSetupData;
  onKeep: () => void;
  onChange: () => void;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (input?.toLowerCase() === "k") {
      onKeep();
      return;
    }
    if (input?.toLowerCase() === "c") {
      onChange();
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Model Setup
      </Text>
      <Text />
      <Text>Current configuration:</Text>
      <Text>
        {" "}
        Primary: {currentValues.provider}/{currentValues.model}
      </Text>
      <Text>
        {" "}
        API Key: {currentValues.apiKey ? "••••••••" : "(not set)"} ({currentValues.apiKeyEnvVar})
      </Text>
      {currentValues.baseUrl && <Text> Base URL: {currentValues.baseUrl}</Text>}
      {currentValues.ecoModel && (
        <Text>
          {" "}
          Eco: {currentValues.ecoModel.providerId}/{currentValues.ecoModel.model}
        </Text>
      )}
      {currentValues.embeddingModel && (
        <Text>
          {" "}
          Embedding: {currentValues.embeddingModel.providerId}/{currentValues.embeddingModel.model}
        </Text>
      )}
      <Text />
      <Text>
        <Text color="yellow" bold>
          [K]
        </Text>{" "}
        Keep current{"  "}
        <Text color="yellow" bold>
          [C]
        </Text>{" "}
        Change{"    "}
        <Text dimColor>Esc to go back</Text>
      </Text>
    </Box>
  );
}
