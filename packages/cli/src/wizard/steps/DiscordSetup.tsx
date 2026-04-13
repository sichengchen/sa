import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface DiscordSetupData {
  discordToken: string;
  discordGuildId: string;
}

interface DiscordSetupProps {
  onNext: (data: DiscordSetupData) => void;
  onBack: () => void;
  currentValues?: DiscordSetupData;
}

export function DiscordSetup({ onNext, onBack, currentValues }: DiscordSetupProps) {
  const [token, setToken] = useState(currentValues?.discordToken ?? "");
  const [guildId, setGuildId] = useState(currentValues?.discordGuildId ?? "");
  const [phase, setPhase] = useState<"keep-or-change" | "token" | "guild">(
    currentValues ? "keep-or-change" : "token",
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
        setPhase("token");
        return;
      }
      return;
    }

    if (phase === "token") {
      if (key.escape) {
        if (currentValues) {
          setPhase("keep-or-change");
          return;
        }
        onBack();
        return;
      }
      if (key.return) {
        if (!token) {
          onNext({ discordToken: "", discordGuildId: "" });
          return;
        }
        setPhase("guild");
        return;
      }
      if (key.backspace || key.delete) {
        setToken((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setToken((v) => v + input);
      }
    } else if (phase === "guild") {
      if (key.escape) {
        setPhase("token");
        return;
      }
      if (key.return) {
        onNext({ discordToken: token, discordGuildId: guildId });
        return;
      }
      if (key.backspace || key.delete) {
        setGuildId((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setGuildId((v) => v + input);
      }
    }
  });

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Discord Bot Setup
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text>
          {"  "}Bot token: {currentValues.discordToken ? "configured" : "not configured"}
        </Text>
        <Text>
          {"  "}Guild ID: {currentValues.discordGuildId || "not set"}
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

  if (phase === "guild") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Discord Guild (Server) ID
        </Text>
        <Text />
        <Text>Enter the Discord server (guild) ID where the bot will operate.</Text>
        <Text dimColor>Leave empty to allow all servers.</Text>
        <Text />
        <Box>
          <Text color="blue">Guild ID: </Text>
          <Text>{guildId}</Text>
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
        Discord Bot Setup (optional)
      </Text>
      <Text />
      <Text>
        To use Esperta Aria via Discord, create a bot at discord.com/developers/applications.
      </Text>
      <Text>Enter the bot token, or leave empty to skip.</Text>
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
