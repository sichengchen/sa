import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface LinearSetupData {
  linearApiKey: string;
  linearWebhookSecret: string;
}

interface LinearSetupProps {
  onNext: (data: LinearSetupData) => void;
  onBack: () => void;
  currentValues?: LinearSetupData;
}

export function LinearSetup({ onNext, onBack, currentValues }: LinearSetupProps) {
  const [apiKey, setApiKey] = useState(currentValues?.linearApiKey ?? "");
  const [secret, setSecret] = useState(currentValues?.linearWebhookSecret ?? "");
  const [phase, setPhase] = useState<"keep-or-change" | "key" | "secret">(
    currentValues ? "keep-or-change" : "key",
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
        setPhase("key");
        return;
      }
      return;
    }

    if (phase === "key") {
      if (key.escape) {
        if (currentValues) {
          setPhase("keep-or-change");
          return;
        }
        onBack();
        return;
      }
      if (key.return) {
        if (!apiKey) {
          onNext({ linearApiKey: "", linearWebhookSecret: "" });
          return;
        }
        setPhase("secret");
        return;
      }
      if (key.backspace || key.delete) {
        setApiKey((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setApiKey((v) => v + input);
      }
    } else if (phase === "secret") {
      if (key.escape) {
        setPhase("key");
        return;
      }
      if (key.return) {
        onNext({ linearApiKey: apiKey, linearWebhookSecret: secret });
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
          Linear Bot Setup
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text> API key: {currentValues.linearApiKey ? "configured" : "not configured"}</Text>
        <Text>
          {" "}
          Webhook secret: {currentValues.linearWebhookSecret ? "configured" : "not configured"}
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
          Linear Webhook Secret
        </Text>
        <Text />
        <Text>Enter the webhook signing secret (optional, for verifying payloads).</Text>
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
        Linear Bot Setup (optional)
      </Text>
      <Text />
      <Text>
        To use Esperta Aria via Linear (issue mentions), generate an API key at
        linear.app/settings/api.
      </Text>
      <Text>Enter the API key, or leave empty to skip.</Text>
      <Text />
      <Box>
        <Text color="blue">API Key: </Text>
        <Text>{apiKey}</Text>
        <Text color="blue">{"▊"}</Text>
      </Box>
      <Text />
      <Text dimColor>Enter to proceed (or skip) | Esc to go back</Text>
    </Box>
  );
}
