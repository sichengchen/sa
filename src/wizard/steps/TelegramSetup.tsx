import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { randomBytes } from "node:crypto";

function generatePairingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

interface TelegramSetupProps {
  onNext: (data: { botToken: string; pairingCode?: string }) => void;
  onBack: () => void;
  currentValues?: { botToken: string; pairingCode?: string };
}

export function TelegramSetup({ onNext, onBack, currentValues }: TelegramSetupProps) {
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<"keep-or-change" | "token" | "code">(
    currentValues ? "keep-or-change" : "token"
  );
  const [pairingCode, setPairingCode] = useState("");

  useInput((input, key) => {
    if (phase === "keep-or-change") {
      if (key.escape) { onBack(); return; }
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
        if (currentValues) { setPhase("keep-or-change"); return; }
        onBack();
        return;
      }
      if (key.return) {
        if (!token) {
          // Skip Telegram setup entirely
          onNext({ botToken: "", pairingCode: undefined });
          return;
        }
        // Generate a pairing code and advance to code phase
        const code = generatePairingCode();
        setPairingCode(code);
        setPhase("code");
        return;
      }
      if (key.backspace || key.delete) {
        setToken((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setToken((v) => v + input);
      }
    } else {
      // code phase — just wait for Enter to proceed
      if (key.return) {
        onNext({ botToken: token, pairingCode });
      }
    }
  });

  if (phase === "keep-or-change" && currentValues) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Telegram Bot Setup
        </Text>
        <Text />
        <Text>Current configuration:</Text>
        <Text>
          {"  "}Bot token: {currentValues.botToken ? "configured" : "not configured"}
        </Text>
        <Text>
          {"  "}Pairing code: {currentValues.pairingCode ?? "none"}
        </Text>
        <Text />
        <Text>
          <Text color="yellow" bold>[K]</Text> Keep current{"  "}
          <Text color="yellow" bold>[C]</Text> Change{"    "}
          <Text dimColor>Esc to go back</Text>
        </Text>
      </Box>
    );
  }

  if (phase === "code") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          Authorize Your Telegram Account
        </Text>
        <Text />
        <Text>
          Send the following message to your bot to pair your account:
        </Text>
        <Text />
        <Box>
          <Text color="yellow" bold>
            {"  /pair "}
          </Text>
          <Text bold>{pairingCode}</Text>
        </Box>
        <Text />
        <Text dimColor>
          The bot will only respond to you after pairing. You can re-pair at any
          time by sending /pair with the same code.
        </Text>
        <Text />
        <Text dimColor>Press Enter to continue</Text>
      </Box>
    );
  }

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
