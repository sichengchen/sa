import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface TelegramSetupProps {
  onNext: (data: { botToken: string }) => void;
  onBack: () => void;
}

export function TelegramSetup({ onNext, onBack }: TelegramSetupProps) {
  const [token, setToken] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      onNext({ botToken: token });
      return;
    }
    if (key.backspace || key.delete) {
      setToken((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setToken((v) => v + input);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Telegram Bot Setup (optional)
      </Text>
      <Text />
      <Text>
        To use SA via Telegram, create a bot with @BotFather and enter the token.
      </Text>
      <Text>Leave empty to skip — you can set it up later.</Text>
      <Text />
      <Box>
        <Text color="blue">Bot Token: </Text>
        <Text>{token}</Text>
        <Text color="blue">{"▊"}</Text>
      </Box>
      <Text />
      <Text dimColor>Enter to proceed (or skip) | Esc to go back</Text>
    </Box>
  );
}
