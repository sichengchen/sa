import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

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

  return (
    <Box borderStyle="single" borderColor={disabled ? "gray" : "blue"} paddingX={1}>
      <Text color="blue" bold>
        {"> "}
      </Text>
      <Text>{value}</Text>
      {!disabled && <Text color="blue">{"▊"}</Text>}
    </Box>
  );
}
