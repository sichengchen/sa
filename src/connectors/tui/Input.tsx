import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

const SLASH_COMMANDS = ["/new", "/status", "/model", "/models", "/provider"];

interface InputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function Input({ onSubmit, disabled }: InputProps) {
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue((v) => v + input);
    }
  });

  const suggestions =
    !disabled && value.startsWith("/") && value.length < 10
      ? SLASH_COMMANDS.filter((c) => c.startsWith(value) && c !== value)
      : [];

  return (
    <Box flexDirection="column">
      {suggestions.length > 0 && (
        <Box flexDirection="column" paddingX={2}>
          {suggestions.map((cmd) => (
            <Text key={cmd} dimColor>
              {cmd}
            </Text>
          ))}
        </Box>
      )}
      <Box borderStyle="single" borderColor={disabled ? "gray" : "blue"} paddingX={1}>
        <Text color="blue" bold>
          {"> "}
        </Text>
        <Text>{value}</Text>
        {!disabled && <Text color="blue">{"▊"}</Text>}
      </Box>
    </Box>
  );
}
