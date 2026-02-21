import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { SAConfigFile } from "@sa/engine/config/index.js";
import type { ModelConfig } from "@sa/engine/router/index.js";
import { loadSecrets } from "@sa/engine/config/secrets.js";
import { fetchModelList, lookupModelMeta } from "../shared/fetch-models.js";

type Substep = "list" | "add-provider" | "fetching" | "select-model" | "add-fields" | "confirm-remove";
type AddField = "name" | "temperature" | "maxTokens";

const VISIBLE_MODELS = 8;

interface ModelManagerProps {
  config: SAConfigFile;
  homeDir: string;
  onSave: (config: SAConfigFile) => Promise<void>;
  onBack: () => void;
}

export function ModelManager({ config, homeDir, onSave, onBack }: ModelManagerProps) {
  const [substep, setSubstep] = useState<Substep>("list");
  const [selected, setSelected] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  // Add form state
  const [providerIdx, setProviderIdx] = useState(0);
  const [addField, setAddField] = useState<AddField>("name");
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newTemp, setNewTemp] = useState("0.7");
  const [newMaxTokens, setNewMaxTokens] = useState("8192");

  // Fetched model list state
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [manualModel, setManualModel] = useState("");

  const models = config.models;
  // List items: models + add
  const listItems = [
    ...models.map((m) => `${m.name} (${m.provider}/${m.model})${m.name === config.defaultModel ? " *default" : ""}`),
    "+ Add new model",
  ];

  // Trigger model fetch when entering "fetching" substep
  useEffect(() => {
    if (substep !== "fetching") return;
    const provider = config.providers[providerIdx];
    if (!provider) { setSubstep("add-provider"); return; }

    (async () => {
      try {
        // Resolve API key: env var first, then secrets
        let apiKey = process.env[provider.apiKeyEnvVar] ?? "";
        if (!apiKey) {
          const secrets = await loadSecrets(homeDir);
          apiKey = secrets?.apiKeys[provider.apiKeyEnvVar] ?? "";
        }
        if (!apiKey) {
          setFetchedModels([]);
          setFetchError(`No API key found for ${provider.apiKeyEnvVar}`);
          setSubstep("select-model");
          return;
        }
        const modelList = await fetchModelList(
          provider.type as "anthropic" | "openai" | "google" | "openrouter" | "openai-compat",
          apiKey,
          provider.baseUrl ?? "",
        );
        setFetchedModels(modelList);
        setFetchError(null);
      } catch (err: unknown) {
        setFetchedModels([]);
        setFetchError(err instanceof Error ? err.message : String(err));
      }
      setSelectedModelIdx(0);
      setScrollOffset(0);
      setManualModel("");
      setSubstep("select-model");
    })();
  }, [substep]);

  function selectModel(modelId: string) {
    setNewModel(modelId);
    const provider = config.providers[providerIdx];
    const meta = lookupModelMeta(provider.type, modelId);
    setNewName("");
    setNewTemp("0.7");
    setNewMaxTokens(meta ? String(meta.maxTokens) : "8192");
    setAddField("name");
    setSubstep("add-fields");
  }

  useInput((input, key) => {
    // --- LIST ---
    if (substep === "list") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); setNotice(""); return; }
      if (key.downArrow) { setSelected((s) => Math.min(listItems.length - 1, s + 1)); setNotice(""); return; }

      if (key.return) {
        if (selected < models.length) {
          // Set selected model as default
          const target = models[selected];
          if (target.name !== config.defaultModel) {
            const updated = { ...config, defaultModel: target.name };
            onSave(updated);
          }
          return;
        }
        if (selected === models.length) {
          // "Add new"
          setSubstep("add-provider");
          setProviderIdx(0);
          return;
        }
      }

      if (input === "d" && selected < models.length) {
        const target = models[selected];
        if (target.name === config.defaultModel) {
          setNotice("Can't delete the default model — set another as default first");
          return;
        }
        setRemoveTarget(target.name);
        setSubstep("confirm-remove");
      }
      return;
    }

    // --- ADD PROVIDER ---
    if (substep === "add-provider") {
      if (key.escape) { setSubstep("list"); setSelected(0); return; }
      if (key.upArrow) { setProviderIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setProviderIdx((i) => Math.min(config.providers.length - 1, i + 1)); return; }
      if (key.return) {
        setFetchedModels([]);
        setFetchError(null);
        setSubstep("fetching");
      }
      return;
    }

    // --- FETCHING --- (no keyboard input during fetch)
    if (substep === "fetching") return;

    // --- SELECT MODEL ---
    if (substep === "select-model") {
      if (key.escape) { setSubstep("add-provider"); return; }

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
              next >= off + VISIBLE_MODELS ? next - VISIBLE_MODELS + 1 : off,
            );
            return next;
          });
          return;
        }
        if (key.return) {
          selectModel(fetchedModels[selectedModelIdx]);
          return;
        }
      } else {
        // Manual entry fallback
        if (key.return) {
          if (manualModel.trim()) selectModel(manualModel.trim());
          return;
        }
        if (key.backspace || key.delete) { setManualModel((v) => v.slice(0, -1)); return; }
        if (input && !key.ctrl && !key.meta) { setManualModel((v) => v + input); }
      }
      return;
    }

    // --- ADD FIELDS ---
    if (substep === "add-fields") {
      if (key.escape) { setSubstep("select-model"); return; }
      if (key.return) {
        if (addField === "name") { setAddField("temperature"); return; }
        if (addField === "temperature") { setAddField("maxTokens"); return; }
        // Save
        if (!newName.trim()) return;
        if (models.some((m) => m.name === newName.trim())) return;
        const newModelConfig: ModelConfig = {
          name: newName.trim(),
          provider: config.providers[providerIdx].id,
          model: newModel,
          temperature: parseFloat(newTemp) || 0.7,
          maxTokens: parseInt(newMaxTokens) || 8192,
        };
        const updated = { ...config, models: [...config.models, newModelConfig] };
        onSave(updated).then(() => {
          setSubstep("list");
          setSelected(updated.models.length - 1);
        });
        return;
      }

      if (key.backspace || key.delete) {
        if (addField === "name") setNewName((v) => v.slice(0, -1));
        else if (addField === "temperature") setNewTemp((v) => v.slice(0, -1));
        else setNewMaxTokens((v) => v.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        if (addField === "name") setNewName((v) => v + input);
        else if (addField === "temperature") setNewTemp((v) => v + input);
        else setNewMaxTokens((v) => v + input);
      }
      return;
    }

    // --- CONFIRM REMOVE ---
    if (substep === "confirm-remove") {
      if (key.escape || input === "n") { setSubstep("list"); return; }
      if (input === "y") {
        const updated = {
          ...config,
          models: config.models.filter((m) => m.name !== removeTarget),
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
      <Text bold color="cyan">Models</Text>
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
          <Text dimColor>↑↓ navigate | Enter set default | d delete | Esc back</Text>
          {notice !== "" && <Text color="yellow">{notice}</Text>}
        </>
      )}

      {substep === "add-provider" && (
        <>
          <Text>Select provider for new model:</Text>
          {config.providers.map((p, i) => (
            <Text key={p.id}>
              {i === providerIdx ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {p.id} ({p.type})
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
        </>
      )}

      {substep === "fetching" && (
        <Text>Fetching available models from {config.providers[providerIdx]?.id}...</Text>
      )}

      {substep === "select-model" && (
        <>
          {fetchedModels.length > 0 ? (
            <>
              <Text>
                Choose a model ({fetchedModels.length} available from {config.providers[providerIdx]?.id}):
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

      {substep === "add-fields" && (
        <>
          <Text bold>New model (provider: {config.providers[providerIdx]?.id}, model: {newModel})</Text>
          <Text />
          <Box>
            <Text color={addField === "name" ? "blue" : "white"} bold={addField === "name"}>Name: </Text>
            <Text>{newName}</Text>
            {addField === "name" && <Text color="blue">▊</Text>}
          </Box>
          <Box>
            <Text color={addField === "temperature" ? "blue" : "white"} bold={addField === "temperature"}>Temperature: </Text>
            <Text>{newTemp}</Text>
            {addField === "temperature" && <Text color="blue">▊</Text>}
          </Box>
          <Box>
            <Text color={addField === "maxTokens" ? "blue" : "white"} bold={addField === "maxTokens"}>Max Tokens: </Text>
            <Text>{newMaxTokens}</Text>
            {addField === "maxTokens" && <Text color="blue">▊</Text>}
          </Box>
          <Text />
          <Text dimColor>Enter to proceed / save | Esc back</Text>
        </>
      )}

      {substep === "confirm-remove" && (
        <Text>Remove model "{removeTarget}"? (y/n)</Text>
      )}
    </Box>
  );
}
