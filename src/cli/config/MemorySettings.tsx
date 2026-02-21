import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SAConfigFile } from "@sa/engine/config/index.js";

type Substep = "menu" | "edit-directory";

interface MemorySettingsProps {
  config: SAConfigFile;
  onSave: (config: SAConfigFile) => Promise<void>;
  onBack: () => void;
}

export function MemorySettings({ config, onSave, onBack }: MemorySettingsProps) {
  const [substep, setSubstep] = useState<Substep>("menu");
  const [selected, setSelected] = useState(0);
  const [editValue, setEditValue] = useState("");

  const memory = config.runtime.memory;
  const menuItems = [
    { key: "toggle", label: `Memory: ${memory.enabled ? "enabled" : "disabled"}` },
    { key: "directory", label: `Directory: ${memory.directory}` },
  ];

  useInput((input, key) => {
    // --- MENU ---
    if (substep === "menu") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(menuItems.length - 1, s + 1)); return; }
      if (key.return) {
        if (selected === 0) {
          // Toggle enabled
          const updated: SAConfigFile = {
            ...config,
            runtime: {
              ...config.runtime,
              memory: { ...config.runtime.memory, enabled: !memory.enabled },
            },
          };
          onSave(updated);
          return;
        }
        if (selected === 1) {
          setEditValue(memory.directory);
          setSubstep("edit-directory");
          return;
        }
      }
      return;
    }

    // --- EDIT DIRECTORY ---
    if (key.escape) { setSubstep("menu"); return; }
    if (key.return) {
      const dir = editValue.trim() || "memory";
      const updated: SAConfigFile = {
        ...config,
        runtime: {
          ...config.runtime,
          memory: { ...config.runtime.memory, directory: dir },
        },
      };
      onSave(updated).then(() => setSubstep("menu"));
      return;
    }
    if (key.backspace || key.delete) {
      setEditValue((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setEditValue((v) => v + input);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Memory Settings</Text>
      <Text />

      {substep === "menu" && (
        <>
          {menuItems.map((item, i) => (
            <Text key={item.key}>
              {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
              {item.label}
            </Text>
          ))}
          <Text />
          <Text dimColor>↑↓ navigate | Enter toggle/edit | Esc back</Text>
        </>
      )}

      {substep === "edit-directory" && (
        <>
          <Text bold>Memory Directory</Text>
          <Text dimColor>Relative to ~/.sa/ — default: memory</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Directory: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}
    </Box>
  );
}
