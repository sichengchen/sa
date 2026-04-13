import React from "react";
import { Box, Text, useInput } from "ink";

interface WelcomeProps {
  onNext: () => void;
}

export function Welcome({ onNext }: WelcomeProps) {
  useInput((_input, key) => {
    if (key.return) onNext();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Welcome to Esperta Aria
      </Text>
      <Text />
      <Text>Esperta Aria is your local-first agent runtime.</Text>
      <Text />
      <Text>
        Aria Runtime runs in the background with thin connectors for TUI, Telegram, and Discord.
        This wizard will help you set up:
      </Text>
      <Text> 1. Agent identity and personality</Text>
      <Text> 2. Your profile (name, preferences)</Text>
      <Text> 3. LLM model provider and API key</Text>
      <Text> 4. Telegram bot (optional)</Text>
      <Text> 5. Discord bot (optional)</Text>
      <Text> 6. Agent skills</Text>
      <Text />
      <Text dimColor>Press Enter to begin...</Text>
    </Box>
  );
}
