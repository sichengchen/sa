import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface SlackSetupData {
  slackToken: string;
  slackSigningSecret: string;
}

interface SlackSetupProps {
  onNext: (data: SlackSetupData) => void;
  onBack: () => void;
  currentValues?: SlackSetupData;
}

export function SlackSetup({ onNext, onBack, currentValues }: SlackSetupProps) {
  const [token, setToken] = useState(currentValues?.slackToken ?? "");
  const [secret, setSecret] = useState(currentValues?.slackSigningSecret ?? "");
  const [phase, setPhase] = useState<"keep-or-change" | "token" | "secret">(
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
          onNext({ slackToken: "", slackSigningSecret: "" });
          return;
        }
        setPhase("secret");
        return;
      }
      if (key.backspace || key.delete) {
        setToken((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setToken((v) => v + input);
      }
    } else if (phase === "secret") {
      if (key.escape) {
        setPhase("token");
        return;
      }
      if (key.return) {
        onNext({ slackToken: token, slackSigningSecret: secret });
        return;
      }
      if (key.backspace || key.delete) {
        setSecret((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSecret((v) => v + input);
      }
    }
  });

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Slack Bot Setup
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text> Bot token: {currentValues.slackToken ? "configured" : "not configured"}</Text>
        <Text>
          {" "}
          Signing secret: {currentValues.slackSigningSecret ? "configured" : "not configured"}
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

  if (phase === "secret") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Slack Signing Secret
        </Text>
        <Text />
        <Text>Enter the signing secret from your Slack app settings (Basic Information).</Text>
        <Text />
        <Box>
          <Text color="blue">Secret: </Text>
          <Text>{secret}</Text>
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
        Slack Bot Setup (optional)
      </Text>
      <Text />
      <Text>To use Esperta Aria via Slack, create an app at api.slack.com/apps.</Text>
      <Text>Enter the bot token (xoxb-...), or leave empty to skip.</Text>
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
