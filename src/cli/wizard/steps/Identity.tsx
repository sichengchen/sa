import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface IdentityProps {
  onNext: (data: { name: string; personality: string }) => void;
  onBack: () => void;
  currentValues?: { name: string; personality: string };
}

export function Identity({ onNext, onBack, currentValues }: IdentityProps) {
  const [phase, setPhase] = useState<"keep-or-change" | "edit">(
    currentValues ? "keep-or-change" : "edit"
  );
  const [field, setField] = useState<"name" | "personality">("name");
  const [name, setName] = useState(currentValues?.name ?? "Esperta Aria");
  const [personality, setPersonality] = useState(
    currentValues?.personality ?? "Helpful, concise, and proactive personal assistant"
  );

  useInput((input, key) => {
    if (phase === "keep-or-change") {
      if (key.escape) { onBack(); return; }
      if (input?.toLowerCase() === "k" && currentValues) {
        onNext(currentValues);
        return;
      }
      if (input?.toLowerCase() === "c") {
        setPhase("edit");
        return;
      }
      return;
    }

    if (key.escape) {
      if (currentValues) { setPhase("keep-or-change"); return; }
      onBack();
      return;
    }

    if (key.return) {
      if (field === "name") {
        setField("personality");
      } else {
        onNext({ name: name || "Esperta Aria", personality });
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

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Agent Identity
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text>  Name: {currentValues.name}</Text>
        <Text>  Personality: {currentValues.personality}</Text>
        <Text />
        <Text>
          <Text color="yellow" bold>[K]</Text> Keep current{"  "}
          <Text color="yellow" bold>[C]</Text> Change{"    "}
          <Text dimColor>Esc to go back</Text>
        </Text>
      </Box>
    );
  }

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
