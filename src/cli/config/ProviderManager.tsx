import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SAConfigFile } from "../../engine/config/index.js";
import type { ProviderConfig } from "../../engine/router/index.js";

type Substep = "list" | "add-type" | "add-fields" | "confirm-remove";
type ProviderType = "anthropic" | "openai" | "google" | "openrouter" | "nvidia" | "openai-compat";
type AddField = "id" | "apiKeyEnvVar" | "baseUrl";

const PROVIDER_TYPES: { type: ProviderType; label: string; defaultEnvVar: string }[] = [
  { type: "anthropic", label: "Anthropic", defaultEnvVar: "ANTHROPIC_API_KEY" },
  { type: "openai", label: "OpenAI", defaultEnvVar: "OPENAI_API_KEY" },
  { type: "google", label: "Google", defaultEnvVar: "GOOGLE_AI_API_KEY" },
  { type: "openrouter", label: "OpenRouter", defaultEnvVar: "OPENROUTER_API_KEY" },
  { type: "nvidia", label: "Nvidia NIM", defaultEnvVar: "NVIDIA_API_KEY" },
  { type: "openai-compat", label: "OpenAI compatible", defaultEnvVar: "" },
];

interface ProviderManagerProps {
  config: SAConfigFile;
  onSave: (config: SAConfigFile) => Promise<void>;
  onBack: () => void;
}

export function ProviderManager({ config, onSave, onBack }: ProviderManagerProps) {
  const [substep, setSubstep] = useState<Substep>("list");
  const [selected, setSelected] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<string>("");

  // Add form state
  const [addField, setAddField] = useState<AddField>("id");
  const [newId, setNewId] = useState("");
  const [newEnvVar, setNewEnvVar] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");

  const providers = config.providers;
  // List items: existing providers + "Add new provider"
  const listItems = [...providers.map((p) => `${p.id} (${p.type})`), "+ Add new provider"];

  useInput((input, key) => {
    // --- LIST ---
    if (substep === "list") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(listItems.length - 1, s + 1)); return; }

      if (key.return) {
        if (selected === providers.length) {
          // "Add new" selected
          setSubstep("add-type");
          setTypeIdx(0);
          return;
        }
      }

      // 'd' to delete selected provider
      if (input === "d" && selected < providers.length) {
        const target = providers[selected];
        const referencedBy = config.models.filter((m) => m.provider === target.id);
        if (referencedBy.length > 0) {
          // Can't remove — models reference it (show inline)
          return;
        }
        setRemoveTarget(target.id);
        setSubstep("confirm-remove");
        return;
      }
      return;
    }

    // --- ADD TYPE ---
    if (substep === "add-type") {
      if (key.escape) { setSubstep("list"); return; }
      if (key.upArrow) { setTypeIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setTypeIdx((i) => Math.min(PROVIDER_TYPES.length - 1, i + 1)); return; }
      if (key.return) {
        const pt = PROVIDER_TYPES[typeIdx];
        const isCompat = pt.type === "openai-compat";
        setNewId(isCompat ? "" : pt.type);
        setNewEnvVar(pt.defaultEnvVar);
        setNewBaseUrl("");
        setAddField(isCompat ? "id" : "apiKeyEnvVar");
        setSubstep("add-fields");
      }
      return;
    }

    // --- ADD FIELDS ---
    if (substep === "add-fields") {
      if (key.escape) { setSubstep("add-type"); return; }

      const isCompat = PROVIDER_TYPES[typeIdx].type === "openai-compat";

      if (key.return) {
        if (isCompat) {
          if (addField === "id") { setAddField("apiKeyEnvVar"); return; }
          if (addField === "apiKeyEnvVar") { setAddField("baseUrl"); return; }
        }
        // Save
        if (!newId.trim()) return;
        if (providers.some((p) => p.id === newId.trim())) return; // duplicate
        const newProvider: ProviderConfig = {
          id: newId.trim(),
          type: PROVIDER_TYPES[typeIdx].type as any,
          apiKeyEnvVar: newEnvVar.trim() || `${newId.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`,
          ...(newBaseUrl.trim() ? { baseUrl: newBaseUrl.trim() } : {}),
        };
        const updated = { ...config, providers: [...config.providers, newProvider] };
        onSave(updated).then(() => {
          setSubstep("list");
          setSelected(updated.providers.length - 1);
        });
        return;
      }

      if (key.backspace || key.delete) {
        if (addField === "id") setNewId((v) => v.slice(0, -1));
        else if (addField === "apiKeyEnvVar") setNewEnvVar((v) => v.slice(0, -1));
        else setNewBaseUrl((v) => v.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        if (addField === "id") setNewId((v) => v + input);
        else if (addField === "apiKeyEnvVar") setNewEnvVar((v) => v + input);
        else setNewBaseUrl((v) => v + input);
      }
      return;
    }

    // --- CONFIRM REMOVE ---
    if (substep === "confirm-remove") {
      if (key.escape || input === "n") { setSubstep("list"); return; }
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

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Providers</Text>
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
            <Text key={pt.type}>
              {i === typeIdx ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {pt.label}
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
        </>
      )}

      {substep === "add-fields" && (
        <>
          <Text bold>New {PROVIDER_TYPES[typeIdx].label} provider</Text>
          <Text />
          <Box>
            <Text color={addField === "id" ? "blue" : "white"} bold={addField === "id"}>ID: </Text>
            <Text>{newId}</Text>
            {addField === "id" && <Text color="blue">▊</Text>}
          </Box>
          <Box>
            <Text color={addField === "apiKeyEnvVar" ? "blue" : "white"} bold={addField === "apiKeyEnvVar"}>API Key Env Var: </Text>
            <Text>{newEnvVar}</Text>
            {addField === "apiKeyEnvVar" && <Text color="blue">▊</Text>}
          </Box>
          {PROVIDER_TYPES[typeIdx].type === "openai-compat" && (
            <Box>
              <Text color={addField === "baseUrl" ? "blue" : "white"} bold={addField === "baseUrl"}>Base URL: </Text>
              <Text>{newBaseUrl}</Text>
              {addField === "baseUrl" && <Text color="blue">▊</Text>}
            </Box>
          )}
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
