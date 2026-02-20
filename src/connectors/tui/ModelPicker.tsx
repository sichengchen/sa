import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ModelPickerProps {
  models: string[];
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
    Math.max(0, models.indexOf(activeModel))
  );

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSelect(models[selectedIndex]);
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
      {models.map((name, i) => (
        <Box key={name}>
          <Text color={i === selectedIndex ? "cyan" : undefined}>
            {i === selectedIndex ? "❯ " : "  "}
            {name}
            {name === activeModel ? " (active)" : ""}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
