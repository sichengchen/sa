import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { AriaConfigFile } from "@aria/engine/config/index.js";
import type { ModelConfig, ProviderConfig } from "@aria/engine/router/index.js";
import type { ModelTier } from "@aria/engine/router/task-types.js";
import { loadSecrets } from "@aria/engine/config/secrets.js";
import { fetchModelList, lookupModelMeta } from "../shared/fetch-models.js";

type Screen = "categories" | "chat-list" | "embedding-list" | "tier-assign"
  | "add-provider" | "fetching" | "select-model" | "add-fields"
  | "confirm-remove";
type AddField = "name" | "temperature" | "maxTokens";
type AddModelType = "chat" | "embedding";

const VISIBLE_MODELS = 8;
const TIERS: ModelTier[] = ["performance", "normal", "eco"];

interface ModelManagerProps {
  config: AriaConfigFile;
  homeDir: string;
  onSave: (config: AriaConfigFile) => Promise<void>;
  onBack: () => void;
}

export function ModelManager({ config, homeDir, onSave, onBack }: ModelManagerProps) {
  const [screen, setScreen] = useState<Screen>("categories");
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState("");
  const [removeTarget, setRemoveTarget] = useState("");

  // Add flow state
  const [addModelType, setAddModelType] = useState<AddModelType>("chat");
  const [providerIdx, setProviderIdx] = useState(0);
  const [addField, setAddField] = useState<AddField>("name");
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newTemp, setNewTemp] = useState("0.7");
  const [newMaxTokens, setNewMaxTokens] = useState("8192");

  // Tier assignment state
  const [tierIdx, setTierIdx] = useState(0);
  const [tierModelIdx, setTierModelIdx] = useState(0);

  // Model fetch state
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [manualModel, setManualModel] = useState("");

  const chatModels = config.models.filter((m) => m.type !== "embedding");
  const embeddingModels = config.models.filter((m) => m.type === "embedding");
  const tiers = config.runtime.modelTiers ?? {};

  // Trigger model fetch
  useEffect(() => {
    if (screen !== "fetching") return;
    const provider = config.providers[providerIdx];
    if (!provider) { setScreen("add-provider"); return; }

    (async () => {
      try {
        let apiKey = process.env[provider.apiKeyEnvVar] ?? "";
        if (!apiKey) {
          const secrets = await loadSecrets(homeDir);
          apiKey = secrets?.apiKeys[provider.apiKeyEnvVar] ?? "";
        }
        if (!apiKey) {
          setFetchedModels([]);
          setFetchError(`No API key found for ${provider.apiKeyEnvVar}`);
          setScreen("select-model");
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
      setScreen("select-model");
    })();
  }, [screen]);

  function selectModel(modelId: string) {
    setNewModel(modelId);
    if (addModelType === "embedding") {
      // Embedding models skip name/temp/maxTokens — save immediately
      const name = `embedding${embeddingModels.length > 0 ? `-${embeddingModels.length + 1}` : ""}`;
      const newModelConfig: ModelConfig = {
        name,
        provider: config.providers[providerIdx].id,
        model: modelId,
        type: "embedding",
      };
      const updated = { ...config, models: [...config.models, newModelConfig] };
      onSave(updated).then(() => {
        setScreen("embedding-list");
        setSelected(0);
      });
      return;
    }
    // Chat model — go to add-fields
    const provider = config.providers[providerIdx];
    const meta = lookupModelMeta(provider.type, modelId);
    setNewName("");
    setNewTemp("0.7");
    setNewMaxTokens(meta ? String(meta.maxTokens) : "8192");
    setAddField("name");
    setScreen("add-fields");
  }

  function getTierModel(tier: ModelTier): string {
    return tiers[tier] ?? config.defaultModel;
  }

  function setTier(tier: ModelTier, modelName: string) {
    const newTiers = { ...tiers, [tier]: modelName };
    // If all tiers point to default, remove modelTiers entirely
    const allDefault = TIERS.every((t) => (newTiers[t] ?? config.defaultModel) === config.defaultModel);
    const updated: AriaConfigFile = {
      ...config,
      runtime: {
        ...config.runtime,
        modelTiers: allDefault ? undefined : newTiers,
      },
    };
    onSave(updated);
  }

  useInput((input, key) => {
    // --- CATEGORIES ---
    if (screen === "categories") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(1, s + 1)); return; }
      if (key.return) {
        setSelected(0);
        setScreen(selected === 0 ? "chat-list" : "embedding-list");
      }
      return;
    }

    // --- CHAT LIST ---
    if (screen === "chat-list") {
      // Items: chat models + "Tier Assignments" separator + tier rows + "+ Add chat model"
      const items = chatModels.length + 1 + TIERS.length + 1; // models + separator + tiers + add
      if (key.escape) { setScreen("categories"); setSelected(0); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); setNotice(""); return; }
      if (key.downArrow) { setSelected((s) => Math.min(items - 1, s + 1)); setNotice(""); return; }

      if (key.return) {
        if (selected < chatModels.length) {
          // Set as default
          const target = chatModels[selected];
          if (target.name !== config.defaultModel) {
            onSave({ ...config, defaultModel: target.name });
          }
          return;
        }
        if (selected === chatModels.length) return; // Separator — no action
        const tierOff = selected - chatModels.length - 1;
        if (tierOff >= 0 && tierOff < TIERS.length) {
          // Tier assignment
          setTierIdx(tierOff);
          setTierModelIdx(0);
          setScreen("tier-assign");
          return;
        }
        if (selected === items - 1) {
          // Add chat model
          setAddModelType("chat");
          setProviderIdx(0);
          setScreen("add-provider");
          return;
        }
      }

      if (input === "d" && selected < chatModels.length) {
        const target = chatModels[selected];
        if (target.name === config.defaultModel) {
          setNotice("Can't delete the default model — set another as default first");
          return;
        }
        if (chatModels.length <= 1) {
          setNotice("Must have at least one chat model");
          return;
        }
        setRemoveTarget(target.name);
        setScreen("confirm-remove");
      }
      return;
    }

    // --- EMBEDDING LIST ---
    if (screen === "embedding-list") {
      const items = embeddingModels.length + 1; // models + add
      if (key.escape) { setScreen("categories"); setSelected(0); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(items - 1, s + 1)); return; }

      if (key.return && selected === items - 1) {
        // Add embedding model
        setAddModelType("embedding");
        setProviderIdx(0);
        setScreen("add-provider");
        return;
      }

      if (input === "d" && selected < embeddingModels.length) {
        setRemoveTarget(embeddingModels[selected].name);
        setScreen("confirm-remove");
      }
      return;
    }

    // --- TIER ASSIGN ---
    if (screen === "tier-assign") {
      if (key.escape) { setScreen("chat-list"); return; }
      if (key.upArrow) { setTierModelIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setTierModelIdx((i) => Math.min(chatModels.length - 1, i + 1)); return; }
      if (key.return) {
        setTier(TIERS[tierIdx], chatModels[tierModelIdx].name);
        setScreen("chat-list");
      }
      return;
    }

    // --- ADD PROVIDER ---
    if (screen === "add-provider") {
      if (key.escape) {
        setScreen(addModelType === "chat" ? "chat-list" : "embedding-list");
        setSelected(0);
        return;
      }
      if (key.upArrow) { setProviderIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setProviderIdx((i) => Math.min(config.providers.length - 1, i + 1)); return; }
      if (key.return) {
        setFetchedModels([]);
        setFetchError(null);
        setScreen("fetching");
      }
      return;
    }

    // --- FETCHING ---
    if (screen === "fetching") return;

    // --- SELECT MODEL ---
    if (screen === "select-model") {
      if (key.escape) { setScreen("add-provider"); return; }
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
        if (key.return) {
          if (manualModel.trim()) selectModel(manualModel.trim());
          return;
        }
        if (key.backspace || key.delete) { setManualModel((v) => v.slice(0, -1)); return; }
        if (input && !key.ctrl && !key.meta) { setManualModel((v) => v + input); }
      }
      return;
    }

    // --- ADD FIELDS (chat only) ---
    if (screen === "add-fields") {
      if (key.escape) { setScreen("select-model"); return; }
      if (key.return) {
        if (addField === "name") { setAddField("temperature"); return; }
        if (addField === "temperature") { setAddField("maxTokens"); return; }
        // Save
        if (!newName.trim()) return;
        if (config.models.some((m) => m.name === newName.trim())) return;
        const newModelConfig: ModelConfig = {
          name: newName.trim(),
          provider: config.providers[providerIdx].id,
          model: newModel,
          temperature: parseFloat(newTemp) || 0.7,
          maxTokens: parseInt(newMaxTokens) || 8192,
        };
        const updated = { ...config, models: [...config.models, newModelConfig] };
        onSave(updated).then(() => {
          setScreen("chat-list");
          setSelected(0);
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
    if (screen === "confirm-remove") {
      if (key.escape || input === "n") {
        const isEmb = embeddingModels.some((m) => m.name === removeTarget);
        setScreen(isEmb ? "embedding-list" : "chat-list");
        return;
      }
      if (input === "y") {
        // Also clean up tier references
        const newTiers = { ...tiers };
        for (const tier of TIERS) {
          if (newTiers[tier] === removeTarget) delete newTiers[tier];
        }
        const updated: AriaConfigFile = {
          ...config,
          models: config.models.filter((m) => m.name !== removeTarget),
          runtime: {
            ...config.runtime,
            modelTiers: Object.keys(newTiers).length > 0 ? newTiers : undefined,
          },
        };
        const isEmb = embeddingModels.some((m) => m.name === removeTarget);
        onSave(updated).then(() => {
          setSelected(0);
          setScreen(isEmb ? "embedding-list" : "chat-list");
        });
      }
    }
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Models</Text>
      <Text />

      {screen === "categories" && (
        <>
          {[
            { label: "Chat models", detail: `${chatModels.length} configured` },
            { label: "Embedding models", detail: `${embeddingModels.length} configured` },
          ].map((item, i) => (
            <Text key={item.label}>
              {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {item.label} <Text dimColor>({item.detail})</Text>
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
        </>
      )}

      {screen === "chat-list" && (
        <>
          {chatModels.map((m, i) => {
            const tierLabels = TIERS.filter((t) => getTierModel(t) === m.name);
            const isDefault = m.name === config.defaultModel;
            return (
              <Text key={m.name}>
                {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
                {m.name} ({m.provider}/{m.model})
                {isDefault && <Text color="yellow"> *default</Text>}
                {tierLabels.length > 0 && (
                  <Text dimColor> [{tierLabels.join(", ")}]</Text>
                )}
              </Text>
            );
          })}
          <Text dimColor>  ─────────────────</Text>
          <Text bold>  Tier Assignments</Text>
          {TIERS.map((tier, i) => {
            const idx = chatModels.length + 1 + i;
            const assigned = getTierModel(tier);
            return (
              <Text key={tier}>
                {idx === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
                {"  "}{tier} → {assigned}
              </Text>
            );
          })}
          {(() => {
            const addIdx = chatModels.length + 1 + TIERS.length;
            return (
              <Text>
                {addIdx === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
                + Add chat model
              </Text>
            );
          })()}
          <Text />
          <Text dimColor>Enter set default/tier | d delete | Esc back</Text>
          {notice !== "" && <Text color="yellow">{notice}</Text>}
        </>
      )}

      {screen === "embedding-list" && (
        <>
          {embeddingModels.length === 0 && (
            <Text dimColor>No embedding models configured. Memory uses keyword search only.</Text>
          )}
          {embeddingModels.map((m, i) => (
            <Text key={m.name}>
              {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {m.name} ({m.provider}/{m.model})
            </Text>
          ))}
          <Text>
            {embeddingModels.length === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
            + Add embedding model
          </Text>
          <Text />
          <Text dimColor>d delete | Esc back</Text>
        </>
      )}

      {screen === "tier-assign" && (
        <>
          <Text bold>Assign {TIERS[tierIdx]} tier to:</Text>
          <Text />
          {chatModels.map((m, i) => (
            <Text key={m.name}>
              {i === tierModelIdx ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {m.name} ({m.provider}/{m.model})
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter assign | Esc cancel</Text>
        </>
      )}

      {screen === "add-provider" && (
        <>
          <Text>Select provider for new {addModelType} model:</Text>
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

      {screen === "fetching" && (
        <Text>Fetching available models from {config.providers[providerIdx]?.id}...</Text>
      )}

      {screen === "select-model" && (
        <>
          {fetchedModels.length > 0 ? (
            <>
              <Text>
                Choose a {addModelType} model ({fetchedModels.length} available from {config.providers[providerIdx]?.id}):
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

      {screen === "add-fields" && (
        <>
          <Text bold>New chat model (provider: {config.providers[providerIdx]?.id}, model: {newModel})</Text>
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

      {screen === "confirm-remove" && (
        <Text>Remove model "{removeTarget}"? (y/n)</Text>
      )}
    </Box>
  );
}
