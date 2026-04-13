import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AriaConfigFile } from "@aria/server/config";

type Substep =
  | "menu"
  | "edit-directory"
  | "edit-search-results"
  | "edit-vector-weight"
  | "edit-decay-halflife";

interface MemorySettingsProps {
  config: AriaConfigFile;
  onSave: (config: AriaConfigFile) => Promise<void>;
  onBack: () => void;
}

export function MemorySettings({ config, onSave, onBack }: MemorySettingsProps) {
  const [substep, setSubstep] = useState<Substep>("menu");
  const [selected, setSelected] = useState(0);
  const [editValue, setEditValue] = useState("");

  const memory = config.runtime.memory;
  const search = memory.search ?? {};
  const journal = memory.journal ?? {};
  const decay = search.temporalDecay ?? {};

  const menuItems = [
    {
      key: "toggle",
      label: `Memory: ${memory.enabled ? "enabled" : "disabled"}`,
    },
    { key: "directory", label: `Directory: ${memory.directory}` },
    {
      key: "journal",
      label: `Journal: ${journal.enabled !== false ? "enabled" : "disabled"}`,
    },
    {
      key: "search-results",
      label: `Max search results: ${search.maxResults ?? 10}`,
    },
    {
      key: "vector-weight",
      label: `Vector weight: ${search.vectorWeight ?? 0.6} / Text: ${search.textWeight ?? 0.4}`,
    },
    {
      key: "decay-toggle",
      label: `Temporal decay: ${decay.enabled !== false ? "enabled" : "disabled"}`,
    },
    {
      key: "decay-halflife",
      label: `Decay half-life: ${decay.halfLifeDays ?? 30} days`,
    },
  ];

  function updateMemory(patch: Partial<typeof memory>) {
    const updated: AriaConfigFile = {
      ...config,
      runtime: {
        ...config.runtime,
        memory: { ...config.runtime.memory, ...patch },
      },
    };
    onSave(updated);
  }

  function updateSearch(patch: Partial<NonNullable<typeof memory.search>>) {
    updateMemory({ search: { ...search, ...patch } });
  }

  useInput((input, key) => {
    // --- MENU ---
    if (substep === "menu") {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((s) => Math.min(menuItems.length - 1, s + 1));
        return;
      }
      if (key.return) {
        const item = menuItems[selected];
        if (item.key === "toggle") {
          updateMemory({ enabled: !memory.enabled });
          return;
        }
        if (item.key === "directory") {
          setEditValue(memory.directory);
          setSubstep("edit-directory");
          return;
        }
        if (item.key === "journal") {
          updateMemory({
            journal: { ...journal, enabled: journal.enabled === false },
          });
          return;
        }
        if (item.key === "search-results") {
          setEditValue(String(search.maxResults ?? 10));
          setSubstep("edit-search-results");
          return;
        }
        if (item.key === "vector-weight") {
          setEditValue(String(search.vectorWeight ?? 0.6));
          setSubstep("edit-vector-weight");
          return;
        }
        if (item.key === "decay-toggle") {
          updateSearch({
            temporalDecay: { ...decay, enabled: decay.enabled === false },
          });
          return;
        }
        if (item.key === "decay-halflife") {
          setEditValue(String(decay.halfLifeDays ?? 30));
          setSubstep("edit-decay-halflife");
          return;
        }
      }
      return;
    }

    // --- EDIT FIELDS ---
    if (key.escape) {
      setSubstep("menu");
      return;
    }
    if (key.return) {
      const val = editValue.trim();
      if (substep === "edit-directory") {
        updateMemory({ directory: val || "memory" });
      } else if (substep === "edit-search-results") {
        const n = parseInt(val);
        if (n > 0) updateSearch({ maxResults: n });
      } else if (substep === "edit-vector-weight") {
        const vw = parseFloat(val);
        if (vw >= 0 && vw <= 1)
          updateSearch({
            vectorWeight: vw,
            textWeight: Math.round((1 - vw) * 100) / 100,
          });
      } else if (substep === "edit-decay-halflife") {
        const d = parseInt(val);
        if (d > 0) updateSearch({ temporalDecay: { ...decay, halfLifeDays: d } });
      }
      setSubstep("menu");
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

  const editLabels: Record<string, { title: string; hint: string }> = {
    "edit-directory": {
      title: "Memory Directory",
      hint: "Relative to ~/.aria/ — default: memory",
    },
    "edit-search-results": {
      title: "Max Search Results",
      hint: "Number of results returned by memory search (default: 10)",
    },
    "edit-vector-weight": {
      title: "Vector Weight",
      hint: "0.0–1.0 — text weight auto-fills to complement (default: 0.6)",
    },
    "edit-decay-halflife": {
      title: "Temporal Decay Half-Life",
      hint: "Days until journal score halves (default: 30)",
    },
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Memory Settings
      </Text>
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

      {substep !== "menu" && editLabels[substep] && (
        <>
          <Text bold>{editLabels[substep].title}</Text>
          <Text dimColor>{editLabels[substep].hint}</Text>
          <Text />
          <Box>
            <Text color="blue" bold>
              Value:{" "}
            </Text>
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
