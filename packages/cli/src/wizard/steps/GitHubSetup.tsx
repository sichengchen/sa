import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface GitHubSetupData {
  githubToken: string;
  githubWebhookSecret: string;
}

interface GitHubSetupProps {
  onNext: (data: GitHubSetupData) => void;
  onBack: () => void;
  currentValues?: GitHubSetupData;
}

export function GitHubSetup({ onNext, onBack, currentValues }: GitHubSetupProps) {
  const [token, setToken] = useState(currentValues?.githubToken ?? "");
  const [secret, setSecret] = useState(currentValues?.githubWebhookSecret ?? "");
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
          onNext({ githubToken: "", githubWebhookSecret: "" });
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
        onNext({ githubToken: token, githubWebhookSecret: secret });
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
          GitHub Bot Setup
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text> Token: {currentValues.githubToken ? "configured" : "not configured"}</Text>
        <Text>
          {" "}
          Webhook secret: {currentValues.githubWebhookSecret ? "configured" : "not configured"}
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
          GitHub Webhook Secret
        </Text>
        <Text />
        <Text>Enter the webhook secret (optional, for verifying webhook payloads).</Text>
        <Text dimColor>Leave empty to skip.</Text>
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
        GitHub Bot Setup (optional)
      </Text>
      <Text />
      <Text>
        To use Esperta Aria via GitHub (issue/PR mentions), create a GitHub App or use a PAT.
      </Text>
      <Text>Enter the token, or leave empty to skip.</Text>
      <Text />
      <Box>
        <Text color="blue">Token: </Text>
        <Text>{token}</Text>
        <Text color="blue">{"▊"}</Text>
      </Box>
      <Text />
      <Text dimColor>Enter to proceed (or skip) | Esc to go back</Text>
    </Box>
  );
}
