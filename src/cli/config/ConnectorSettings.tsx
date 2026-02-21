import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { SAConfigFile } from "../../engine/config/index.js";
import { loadSecrets, saveSecrets } from "../../engine/config/secrets.js";
import type { SecretsFile } from "../../engine/config/types.js";

type Substep = "menu" | "edit-telegram-token" | "edit-discord-token" | "edit-discord-guild";

interface ConnectorSettingsProps {
  config: SAConfigFile;
  homeDir: string;
  onSave: (config: SAConfigFile) => Promise<void>;
  onBack: () => void;
}

const MENU_ITEMS = [
  { key: "telegram-token", label: "Telegram bot token" },
  { key: "discord-token", label: "Discord bot token" },
  { key: "discord-guild", label: "Discord guild ID" },
] as const;

export function ConnectorSettings({ config, homeDir, onSave, onBack }: ConnectorSettingsProps) {
  const [substep, setSubstep] = useState<Substep>("menu");
  const [selected, setSelected] = useState(0);
  const [secrets, setSecrets] = useState<SecretsFile | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSecrets(homeDir).then((s) => setSecrets(s ?? { apiKeys: {} }));
  }, [homeDir]);

  const telegramToken = secrets?.botToken ? "●●●●" + secrets.botToken.slice(-4) : "(not set)";
  const discordToken = secrets?.discordToken ? "●●●●" + secrets.discordToken.slice(-4) : "(not set)";
  const discordGuild = secrets?.discordGuildId || "(not set)";

  useInput((input, key) => {
    if (saved) return;

    // --- MENU ---
    if (substep === "menu") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(MENU_ITEMS.length - 1, s + 1)); return; }
      if (key.return) {
        const item = MENU_ITEMS[selected];
        if (item.key === "telegram-token") {
          setEditValue(secrets?.botToken ?? "");
          setSubstep("edit-telegram-token");
        } else if (item.key === "discord-token") {
          setEditValue(secrets?.discordToken ?? "");
          setSubstep("edit-discord-token");
        } else if (item.key === "discord-guild") {
          setEditValue(secrets?.discordGuildId ?? "");
          setSubstep("edit-discord-guild");
        }
      }
      return;
    }

    // --- EDIT FIELDS ---
    if (key.escape) { setSubstep("menu"); return; }
    if (key.return) {
      const updated: SecretsFile = { ...secrets!, apiKeys: { ...secrets!.apiKeys } };
      if (substep === "edit-telegram-token") {
        updated.botToken = editValue.trim() || undefined;
      } else if (substep === "edit-discord-token") {
        updated.discordToken = editValue.trim() || undefined;
      } else if (substep === "edit-discord-guild") {
        updated.discordGuildId = editValue.trim() || undefined;
      }
      setSaved(true);
      saveSecrets(homeDir, updated).then(() => {
        setSecrets(updated);
        setSaved(false);
        setSubstep("menu");
      });
      return;
    }
    if (key.backspace || key.delete) {
      setEditValue((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setEditValue((v) => v + input);
    }
  });

  if (!secrets) {
    return (
      <Box padding={1}>
        <Text>Loading secrets...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Connectors</Text>
      <Text />

      {substep === "menu" && (
        <>
          {MENU_ITEMS.map((item, i) => {
            let detail = "";
            if (item.key === "telegram-token") detail = ` ${telegramToken}`;
            else if (item.key === "discord-token") detail = ` ${discordToken}`;
            else if (item.key === "discord-guild") detail = ` ${discordGuild}`;
            return (
              <Text key={item.key}>
                {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
                {item.label}
                <Text dimColor>{detail}</Text>
              </Text>
            );
          })}
          <Text />
          <Text dimColor>↑↓ navigate | Enter edit | Esc back</Text>
        </>
      )}

      {substep === "edit-telegram-token" && (
        <>
          <Text bold>Telegram Bot Token</Text>
          <Text dimColor>Leave empty to clear. Obtain from @BotFather.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Token: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-discord-token" && (
        <>
          <Text bold>Discord Bot Token</Text>
          <Text dimColor>Leave empty to clear. Obtain from Discord Developer Portal.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Token: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-discord-guild" && (
        <>
          <Text bold>Discord Guild ID</Text>
          <Text dimColor>Leave empty to clear. Right-click server → Copy Server ID.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Guild ID: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {saved && <Text color="yellow">Saving...</Text>}
    </Box>
  );
}
