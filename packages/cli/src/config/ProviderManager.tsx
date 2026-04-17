import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { AriaConfigFile, SecretsFile } from "@aria/server/config";
import { loadSecrets, saveSecrets } from "@aria/server/config/secrets";
import type { ProviderConfig } from "@aria/gateway/router/types";
import {
  MINIMAX_API_KEY_ENV_VAR,
  MINIMAX_ANTHROPIC_BASE_URL,
  MINIMAX_ANTHROPIC_PROVIDER_ID,
  MINIMAX_INTL_ANTHROPIC_BASE_URL,
  MINIMAX_INTL_ANTHROPIC_PROVIDER_ID,
} from "../shared/fetch-models.js";

type Substep = "list" | "add-type" | "add-apikey" | "add-fields" | "confirm-remove";
type ProviderType = "anthropic" | "openai" | "google" | "openrouter" | "nvidia" | "openai-compat";
type CompatField = "id" | "baseUrl" | "apiKey";

export const PROVIDER_TYPES: {
  id: string;
  type: ProviderType;
  label: string;
  defaultEnvVar: string;
  baseUrl?: string;
  compatMode?: "custom";
}[] = [
  {
    id: "anthropic",
    type: "anthropic",
    label: "Anthropic",
    defaultEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    type: "openai",
    label: "OpenAI",
    defaultEnvVar: "OPENAI_API_KEY",
  },
  {
    id: "google",
    type: "google",
    label: "Google",
    defaultEnvVar: "GOOGLE_AI_API_KEY",
  },
  {
    id: "openrouter",
    type: "openrouter",
    label: "OpenRouter",
    defaultEnvVar: "OPENROUTER_API_KEY",
  },
  {
    id: "nvidia",
    type: "nvidia",
    label: "Nvidia NIM",
    defaultEnvVar: "NVIDIA_API_KEY",
  },
  {
    id: MINIMAX_ANTHROPIC_PROVIDER_ID,
    type: "anthropic",
    label: "MiniMax CN (Anthropic-compatible)",
    defaultEnvVar: MINIMAX_API_KEY_ENV_VAR,
    baseUrl: MINIMAX_ANTHROPIC_BASE_URL,
  },
  {
    id: MINIMAX_INTL_ANTHROPIC_PROVIDER_ID,
    type: "anthropic",
    label: "MiniMax Intl (Anthropic-compatible)",
    defaultEnvVar: MINIMAX_API_KEY_ENV_VAR,
    baseUrl: MINIMAX_INTL_ANTHROPIC_BASE_URL,
  },
];

interface ProviderManagerProps {
  config: AriaConfigFile;
  homeDir: string;
  onSave: (config: AriaConfigFile) => Promise<void>;
  onBack: () => void;
}

export function ProviderManager({ config, homeDir, onSave, onBack }: ProviderManagerProps) {
  const [substep, setSubstep] = useState<Substep>("list");
  const [selected, setSelected] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<string>("");
  const [secrets, setSecrets] = useState<SecretsFile | null>(null);

  // Known-type API key input
  const [apiKeyValue, setApiKeyValue] = useState("");

  // openai-compat form state
  const [compatField, setCompatField] = useState<CompatField>("id");
  const [newId, setNewId] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");

  useEffect(() => {
    loadSecrets(homeDir).then((s) => setSecrets(s ?? { apiKeys: {} }));
  }, [homeDir]);

  const providers = config.providers;
  const listItems = [...providers.map((p) => `${p.id} (${p.type})`), "+ Add new provider"];

  useInput((input, key) => {
    // --- LIST ---
    if (substep === "list") {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((s) => Math.min(listItems.length - 1, s + 1));
        return;
      }

      if (key.return) {
        if (selected === providers.length) {
          setSubstep("add-type");
          setTypeIdx(0);
          return;
        }
      }

      if (input === "d" && selected < providers.length) {
        const target = providers[selected];
        const referencedBy = config.models.filter((m) => m.provider === target.id);
        if (referencedBy.length > 0) return;
        setRemoveTarget(target.id);
        setSubstep("confirm-remove");
        return;
      }
      return;
    }

    // --- ADD TYPE ---
    if (substep === "add-type") {
      if (key.escape) {
        setSubstep("list");
        return;
      }
      if (key.upArrow) {
        setTypeIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setTypeIdx((i) => Math.min(PROVIDER_TYPES.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const pt = PROVIDER_TYPES[typeIdx];
        if (!pt.compatMode) {
          if (providers.some((p) => p.id === pt.id)) return; // already exists
          setApiKeyValue("");
          setSubstep("add-apikey");
        } else {
          setNewId("");
          setNewBaseUrl("");
          setNewApiKey("");
          setCompatField("id");
          setSubstep("add-fields");
        }
      }
      return;
    }

    // --- ADD API KEY (known types) ---
    if (substep === "add-apikey") {
      if (key.escape) {
        setSubstep("add-type");
        return;
      }
      if (key.return) {
        const pt = PROVIDER_TYPES[typeIdx];
        const newProvider: ProviderConfig = {
          id: pt.id,
          type: pt.type as any,
          apiKeyEnvVar: pt.defaultEnvVar,
          ...(pt.baseUrl ? { baseUrl: pt.baseUrl } : {}),
        };
        const updated = {
          ...config,
          providers: [...config.providers, newProvider],
        };

        // Save provider config + secret
        const saveAll = async () => {
          if (apiKeyValue.trim() && secrets) {
            const updatedSecrets = {
              ...secrets,
              apiKeys: {
                ...secrets.apiKeys,
                [pt.defaultEnvVar]: apiKeyValue.trim(),
              },
            };
            await saveSecrets(homeDir, updatedSecrets);
            setSecrets(updatedSecrets);
          }
          await onSave(updated);
        };
        saveAll().then(() => {
          setSubstep("list");
          setSelected(updated.providers.length - 1);
        });
        return;
      }
      if (key.backspace || key.delete) {
        setApiKeyValue((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setApiKeyValue((v) => v + input);
      }
      return;
    }

    // --- ADD FIELDS (openai-compat) ---
    if (substep === "add-fields") {
      if (key.escape) {
        if (compatField === "id") {
          setSubstep("add-type");
          return;
        }
        if (compatField === "baseUrl") {
          setCompatField("id");
          return;
        }
        if (compatField === "apiKey") {
          setCompatField("baseUrl");
          return;
        }
        return;
      }

      if (key.return) {
        if (compatField === "id") {
          if (!newId.trim()) return;
          setCompatField("baseUrl");
          return;
        }
        if (compatField === "baseUrl") {
          setCompatField("apiKey");
          return;
        }
        // Save
        if (!newId.trim()) return;
        if (providers.some((p) => p.id === newId.trim())) return;

        const id = newId.trim();
        const envVar = `OPENAI_COMPAT_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
        const newProvider: ProviderConfig = {
          id,
          type: "openai-compat" as any,
          apiKeyEnvVar: envVar,
          ...(newBaseUrl.trim() ? { baseUrl: newBaseUrl.trim() } : {}),
        };
        const updated = {
          ...config,
          providers: [...config.providers, newProvider],
        };

        const saveAll = async () => {
          if (newApiKey.trim() && secrets) {
            const updatedSecrets = {
              ...secrets,
              apiKeys: { ...secrets.apiKeys, [envVar]: newApiKey.trim() },
            };
            await saveSecrets(homeDir, updatedSecrets);
            setSecrets(updatedSecrets);
          }
          await onSave(updated);
        };
        saveAll().then(() => {
          setSubstep("list");
          setSelected(updated.providers.length - 1);
        });
        return;
      }

      if (key.backspace || key.delete) {
        if (compatField === "id") setNewId((v) => v.slice(0, -1));
        else if (compatField === "baseUrl") setNewBaseUrl((v) => v.slice(0, -1));
        else setNewApiKey((v) => v.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        if (compatField === "id") setNewId((v) => v + input);
        else if (compatField === "baseUrl") setNewBaseUrl((v) => v + input);
        else setNewApiKey((v) => v + input);
      }
      return;
    }

    // --- CONFIRM REMOVE ---
    if (substep === "confirm-remove") {
      if (key.escape || input === "n") {
        setSubstep("list");
        return;
      }
      if (input === "y") {
        const updated = {
          ...config,
          providers: config.providers.filter((p) => p.id !== removeTarget),
        };
        onSave(updated).then(() => {
          setSelected(0);
          setSubstep("list");
        });
      }
    }
  });

  const selectedType = PROVIDER_TYPES[typeIdx];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Providers
      </Text>
      <Text />

      {substep === "list" && (
        <>
          {listItems.map((item, i) => (
            <Text key={i}>
              {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {item}
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | d delete | Esc back</Text>
        </>
      )}

      {substep === "add-type" && (
        <>
          <Text>Select provider type:</Text>
          {PROVIDER_TYPES.map((pt, i) => (
            <Text key={pt.id}>
              {i === typeIdx ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {pt.label}
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
        </>
      )}

      {substep === "add-apikey" && selectedType && (
        <>
          <Text bold>Add {selectedType.label}</Text>
          <Text dimColor>Leave empty to skip. You can set it later in Environment → Secrets.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>
              API Key:{" "}
            </Text>
            <Text>
              {apiKeyValue.length > 0 ? "●".repeat(Math.min(apiKeyValue.length, 20)) : ""}
            </Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc back</Text>
        </>
      )}

      {substep === "add-fields" && (
        <>
          <Text bold>New OpenAI-compatible provider</Text>
          <Text />
          <Box>
            <Text color={compatField === "id" ? "blue" : "white"} bold={compatField === "id"}>
              ID:{" "}
            </Text>
            <Text>{newId}</Text>
            {compatField === "id" && <Text color="blue">▊</Text>}
          </Box>
          <Box>
            <Text
              color={compatField === "baseUrl" ? "blue" : "white"}
              bold={compatField === "baseUrl"}
            >
              Base URL:{" "}
            </Text>
            <Text>{newBaseUrl}</Text>
            {compatField === "baseUrl" && <Text color="blue">▊</Text>}
          </Box>
          <Box>
            <Text
              color={compatField === "apiKey" ? "blue" : "white"}
              bold={compatField === "apiKey"}
            >
              API Key:{" "}
            </Text>
            <Text>{newApiKey.length > 0 ? "●".repeat(Math.min(newApiKey.length, 20)) : ""}</Text>
            {compatField === "apiKey" && <Text color="blue">▊</Text>}
          </Box>
          <Text />
          <Text dimColor>Enter to proceed / save | Esc back</Text>
        </>
      )}

      {substep === "confirm-remove" && (
        <>
          <Text>Remove provider "{removeTarget}"? (y/n)</Text>
        </>
      )}
    </Box>
  );
}
