import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface TeamsSetupData {
  teamsBotId: string;
  teamsBotPassword: string;
}

interface TeamsSetupProps {
  onNext: (data: TeamsSetupData) => void;
  onBack: () => void;
  currentValues?: TeamsSetupData;
}

export function TeamsSetup({ onNext, onBack, currentValues }: TeamsSetupProps) {
  const [botId, setBotId] = useState(currentValues?.teamsBotId ?? "");
  const [password, setPassword] = useState(currentValues?.teamsBotPassword ?? "");
  const [phase, setPhase] = useState<"keep-or-change" | "id" | "password">(
    currentValues ? "keep-or-change" : "id",
  );

  useInput((input, key) => {
    if (phase === "keep-or-change") {
      if (key.escape) {
        onBack();
        return;
      }
      if (input?.toLowerCase() === "k" && currentValues) {
        onNext(currentValues);
        return;
      }
      if (input?.toLowerCase() === "c") {
        setPhase("id");
        return;
      }
      return;
    }

    if (phase === "id") {
      if (key.escape) {
        if (currentValues) {
          setPhase("keep-or-change");
          return;
        }
        onBack();
        return;
      }
      if (key.return) {
        if (!botId) {
          onNext({ teamsBotId: "", teamsBotPassword: "" });
          return;
        }
        setPhase("password");
        return;
      }
      if (key.backspace || key.delete) {
        setBotId((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setBotId((v) => v + input);
      }
    } else if (phase === "password") {
      if (key.escape) {
        setPhase("id");
        return;
      }
      if (key.return) {
        onNext({ teamsBotId: botId, teamsBotPassword: password });
        return;
      }
      if (key.backspace || key.delete) {
        setPassword((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setPassword((v) => v + input);
      }
    }
  });

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Microsoft Teams Bot Setup
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text> Bot ID: {currentValues.teamsBotId ? "configured" : "not configured"}</Text>
        <Text>
          {" "}
          Bot password: {currentValues.teamsBotPassword ? "configured" : "not configured"}
        </Text>
        <Text />
        <Text>
          <Text color="yellow" bold>
            [K]
          </Text>{" "}
          Keep current{"  "}
          <Text color="yellow" bold>
            [C]
          </Text>{" "}
          Change{"    "}
          <Text dimColor>Esc to go back</Text>
        </Text>
      </Box>
    );
  }

  if (phase === "password") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Teams Bot Password
        </Text>
        <Text />
        <Text>Enter the bot password from Azure Bot registration.</Text>
        <Text />
        <Box>
          <Text color="blue">Password: </Text>
          <Text>{password}</Text>
          <Text color="blue">{"▊"}</Text>
        </Box>
        <Text />
        <Text dimColor>Enter to proceed | Esc to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Microsoft Teams Bot Setup (optional)
      </Text>
      <Text />
      <Text>To use Esperta Aria via Teams, register a bot in the Azure Bot Framework.</Text>
      <Text>Enter the bot ID (Application ID), or leave empty to skip.</Text>
      <Text />
      <Box>
        <Text color="blue">Bot ID: </Text>
        <Text>{botId}</Text>
        <Text color="blue">{"▊"}</Text>
      </Box>
      <Text />
      <Text dimColor>Enter to proceed (or skip) | Esc to go back</Text>
    </Box>
  );
}
