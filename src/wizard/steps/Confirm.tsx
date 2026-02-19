import React from "react";
import { Box, Text, useInput } from "ink";

export interface WizardData {
  name: string;
  personality: string;
  provider: string;
  model: string;
  apiKeyEnvVar: string;
  apiKey: string;
  botToken: string;
}

interface ConfirmProps {
  data: WizardData;
  onConfirm: () => void;
  onBack: () => void;
}

export function Confirm({ data, onConfirm, onBack }: ConfirmProps) {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      onConfirm();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Confirm Setup
      </Text>
      <Text />
      <Text bold>Identity:</Text>
      <Text> Name: {data.name}</Text>
      <Text> Personality: {data.personality}</Text>
      <Text />
      <Text bold>Model:</Text>
      <Text> Provider: {data.provider}</Text>
      <Text> Model: {data.model}</Text>
      <Text>
        {" "}API Key: {data.apiKey ? "••••••••" : `(set ${data.apiKeyEnvVar} manually)`}
      </Text>
      <Text />
      <Text bold>Telegram:</Text>
      <Text> {data.botToken ? "Configured" : "Skipped"}</Text>
      <Text />
      <Text dimColor>Enter to save | Esc to go back</Text>
    </Box>
  );
}
