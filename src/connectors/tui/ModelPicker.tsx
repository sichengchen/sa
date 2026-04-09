import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ModelConfig } from "@aria/engine/router/types.js";

interface ModelPickerProps {
  models: ModelConfig[];
  activeModel: string;
  onSelect: (name: string) => void;
  onCancel: () => void;
}

export function ModelPicker({
  models,
  activeModel,
  onSelect,
  onCancel,
}: ModelPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, models.findIndex((m) => m.name === activeModel))
  );

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (models.length > 0) onSelect(models[selectedIndex].name);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(models.length - 1, i + 1));
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">
        Switch Model (↑↓ to navigate, Enter to select, Esc to cancel)
      </Text>
      {models.length === 0 && (
        <Text color="yellow">No models configured. Run the setup wizard to add models.</Text>
      )}
      {models.map((m, i) => (
        <Box key={m.name}>
          <Text color={i === selectedIndex ? "cyan" : undefined}>
            {i === selectedIndex ? "● " : "○ "}
            {m.name} ({m.provider} → {m.model})
            {m.name === activeModel ? " (active)" : ""}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
