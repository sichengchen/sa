import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SAConfigFile } from "../../engine/config/index.js";
import type { ModelConfig } from "../../engine/router/index.js";

type Substep = "list" | "add-provider" | "add-fields" | "set-default" | "confirm-remove";
type AddField = "name" | "model" | "temperature" | "maxTokens";

interface ModelManagerProps {
  config: SAConfigFile;
  onSave: (config: SAConfigFile) => Promise<void>;
  onBack: () => void;
}

export function ModelManager({ config, onSave, onBack }: ModelManagerProps) {
  const [substep, setSubstep] = useState<Substep>("list");
  const [selected, setSelected] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<string>("");

  // Add form state
  const [providerIdx, setProviderIdx] = useState(0);
  const [addField, setAddField] = useState<AddField>("name");
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newTemp, setNewTemp] = useState("0.7");
  const [newMaxTokens, setNewMaxTokens] = useState("8192");

  const models = config.models;
  // List items: models + set default + add
  const listItems = [
    ...models.map((m) => `${m.name} (${m.provider}/${m.model})${m.name === config.defaultModel ? " *default" : ""}`),
    "Set default model",
    "+ Add new model",
  ];

  useInput((input, key) => {
    // --- LIST ---
    if (substep === "list") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(listItems.length - 1, s + 1)); return; }

      if (key.return) {
        if (selected === models.length) {
          // "Set default"
          setSubstep("set-default");
          setSelected(0);
          return;
        }
        if (selected === models.length + 1) {
          // "Add new"
          setSubstep("add-provider");
          setProviderIdx(0);
          return;
        }
      }

      if (input === "d" && selected < models.length) {
        const target = models[selected];
        if (target.name === config.defaultModel) return; // Can't remove default
        setRemoveTarget(target.name);
        setSubstep("confirm-remove");
      }
      return;
    }

    // --- SET DEFAULT ---
    if (substep === "set-default") {
      if (key.escape) { setSubstep("list"); setSelected(0); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(models.length - 1, s + 1)); return; }
      if (key.return) {
        const updated = { ...config, defaultModel: models[selected].name };
        onSave(updated).then(() => {
          setSubstep("list");
          setSelected(0);
        });
      }
      return;
    }

    // --- ADD PROVIDER ---
    if (substep === "add-provider") {
      if (key.escape) { setSubstep("list"); setSelected(0); return; }
      if (key.upArrow) { setProviderIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setProviderIdx((i) => Math.min(config.providers.length - 1, i + 1)); return; }
      if (key.return) {
        setNewName("");
        setNewModel("");
        setNewTemp("0.7");
        setNewMaxTokens("8192");
        setAddField("name");
        setSubstep("add-fields");
      }
      return;
    }

    // --- ADD FIELDS ---
    if (substep === "add-fields") {
      if (key.escape) { setSubstep("add-provider"); return; }
      if (key.return) {
        if (addField === "name") { setAddField("model"); return; }
        if (addField === "model") { setAddField("temperature"); return; }
        if (addField === "temperature") { setAddField("maxTokens"); return; }
        // Save
        if (!newName.trim() || !newModel.trim()) return;
        if (models.some((m) => m.name === newName.trim())) return;
        const newModelConfig: ModelConfig = {
          name: newName.trim(),
          provider: config.providers[providerIdx].id,
          model: newModel.trim(),
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
        else if (addField === "model") setNewModel((v) => v.slice(0, -1));
        else if (addField === "temperature") setNewTemp((v) => v.slice(0, -1));
        else setNewMaxTokens((v) => v.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        if (addField === "name") setNewName((v) => v + input);
        else if (addField === "model") setNewModel((v) => v + input);
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
          <Text dimColor>↑↓ navigate | Enter select | d delete | Esc back</Text>
        </>
      )}

      {substep === "set-default" && (
        <>
          <Text>Select default model:</Text>
          {models.map((m, i) => (
            <Text key={m.name}>
              {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {m.name}{m.name === config.defaultModel ? <Text dimColor> (current)</Text> : null}
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
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

      {substep === "add-fields" && (
        <>
          <Text bold>New model (provider: {config.providers[providerIdx].id})</Text>
          <Text />
          <Box>
            <Text color={addField === "name" ? "blue" : "white"} bold={addField === "name"}>Name: </Text>
            <Text>{newName}</Text>
            {addField === "name" && <Text color="blue">▊</Text>}
          </Box>
          <Box>
            <Text color={addField === "model" ? "blue" : "white"} bold={addField === "model"}>Model ID: </Text>
            <Text>{newModel}</Text>
            {addField === "model" && <Text color="blue">▊</Text>}
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
