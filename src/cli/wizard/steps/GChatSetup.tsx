import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface GChatSetupData {
  gchatServiceAccountKey: string;
}

interface GChatSetupProps {
  onNext: (data: GChatSetupData) => void;
  onBack: () => void;
  currentValues?: GChatSetupData;
}

export function GChatSetup({ onNext, onBack, currentValues }: GChatSetupProps) {
  const [key, setKey] = useState(currentValues?.gchatServiceAccountKey ?? "");
  const [phase, setPhase] = useState<"keep-or-change" | "key">(
    currentValues ? "keep-or-change" : "key"
  );

  useInput((input, keyEvent) => {
    if (phase === "keep-or-change") {
      if (keyEvent.escape) { onBack(); return; }
      if (input?.toLowerCase() === "k" && currentValues) { onNext(currentValues); return; }
      if (input?.toLowerCase() === "c") { setPhase("key"); return; }
      return;
    }

    if (keyEvent.escape) {
      if (currentValues) { setPhase("keep-or-change"); return; }
      onBack(); return;
    }
    if (keyEvent.return) { onNext({ gchatServiceAccountKey: key }); return; }
    if (keyEvent.backspace || keyEvent.delete) { setKey((v) => v.slice(0, -1)); return; }
    if (input && !keyEvent.ctrl && !keyEvent.meta) { setKey((v) => v + input); }
  });

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Google Chat Bot Setup</Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text>  Service account key: {currentValues.gchatServiceAccountKey ? "configured" : "not configured"}</Text>
        <Text />
        <Text><Text color="yellow" bold>[K]</Text> Keep current{"  "}<Text color="yellow" bold>[C]</Text> Change{"    "}<Text dimColor>Esc to go back</Text></Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Google Chat Bot Setup (optional)</Text>
      <Text />
      <Text>To use Esperta Aria via Google Chat, create a Chat app in Google Cloud Console.</Text>
      <Text>Enter the path to the service account JSON key file, or leave empty to skip.</Text>
      <Text />
      <Box>
        <Text color="blue">Key path: </Text>
        <Text>{key}</Text>
        <Text color="blue">{"▊"}</Text>
      </Box>
      <Text />
      <Text dimColor>Enter to proceed (or skip) | Esc to go back</Text>
    </Box>
  );
}
