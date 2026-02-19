import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface IdentityProps {
  onNext: (data: { name: string; personality: string }) => void;
  onBack: () => void;
}

export function Identity({ onNext, onBack }: IdentityProps) {
  const [field, setField] = useState<"name" | "personality">("name");
  const [name, setName] = useState("Sasa");
  const [personality, setPersonality] = useState(
    "Helpful, concise, and proactive personal assistant"
  );

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.return) {
      if (field === "name") {
        setField("personality");
      } else {
        onNext({ name: name || "Sasa", personality });
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (field === "name") setName((v) => v.slice(0, -1));
      else setPersonality((v) => v.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      if (field === "name") setName((v) => v + input);
      else setPersonality((v) => v + input);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Agent Identity
      </Text>
      <Text />
      <Box>
        <Text color={field === "name" ? "blue" : "white"} bold={field === "name"}>
          Name:{" "}
        </Text>
        <Text>{name}</Text>
        {field === "name" && <Text color="blue">{"▊"}</Text>}
      </Box>
      <Box>
        <Text
          color={field === "personality" ? "blue" : "white"}
          bold={field === "personality"}
        >
          Personality:{" "}
        </Text>
        <Text>{personality}</Text>
        {field === "personality" && <Text color="blue">{"▊"}</Text>}
      </Box>
      <Text />
      <Text dimColor>Enter to proceed | Esc to go back</Text>
    </Box>
  );
}
