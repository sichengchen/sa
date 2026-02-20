import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { ConfigManager } from "../../engine/config/index.js";
import type { SAConfigFile } from "../../engine/config/index.js";
import { ProviderManager } from "./ProviderManager.js";
import { ModelManager } from "./ModelManager.js";
import { ConnectorSettings } from "./ConnectorSettings.js";
import { MemorySettings } from "./MemorySettings.js";

type Screen = "menu" | "providers" | "models" | "connectors" | "memory";

interface ConfigAppProps {
  homeDir: string;
  onExit: () => void;
}

const MENU_ITEMS = [
  { key: "providers", label: "Providers" },
  { key: "models", label: "Models" },
  { key: "connectors", label: "Connectors (Telegram / Discord)" },
  { key: "memory", label: "Memory settings" },
] as const;

export function ConfigApp({ homeDir, onExit }: ConfigAppProps) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [config, setConfig] = useState<SAConfigFile | null>(null);
  const [manager, setManager] = useState<ConfigManager | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mgr = new ConfigManager(homeDir);
    mgr
      .load()
      .then(() => {
        setManager(mgr);
        setConfig(mgr.getConfigFile());
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [homeDir]);

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">Error loading config: {error}</Text>
      </Box>
    );
  }

  if (!config || !manager) {
    return (
      <Box padding={1}>
        <Text>Loading configuration...</Text>
      </Box>
    );
  }

  async function saveConfig(updated: SAConfigFile) {
    if (!manager) return;
    setConfig(updated);
    await manager.saveConfig(updated);
  }

  switch (screen) {
    case "providers":
      return (
        <ProviderManager
          config={config}
          onSave={saveConfig}
          onBack={() => setScreen("menu")}
        />
      );
    case "models":
      return (
        <ModelManager
          config={config}
          onSave={saveConfig}
          onBack={() => setScreen("menu")}
        />
      );
    case "connectors":
      return (
        <ConnectorSettings
          config={config}
          homeDir={homeDir}
          onSave={saveConfig}
          onBack={() => setScreen("menu")}
        />
      );
    case "memory":
      return (
        <MemorySettings
          config={config}
          onSave={saveConfig}
          onBack={() => setScreen("menu")}
        />
      );
    default:
      return (
        <ConfigMenuScreen
          config={config}
          onSelect={(s) => setScreen(s)}
          onExit={onExit}
        />
      );
  }
}

interface ConfigMenuScreenProps {
  config: SAConfigFile;
  onSelect: (screen: Screen) => void;
  onExit: () => void;
}

function ConfigMenuScreen({ config, onSelect, onExit }: ConfigMenuScreenProps) {
  const [selected, setSelected] = useState(0);

  useInput((_input, key) => {
    if (key.escape) {
      onExit();
      return;
    }
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(MENU_ITEMS.length - 1, s + 1));
      return;
    }
    if (key.return) {
      onSelect(MENU_ITEMS[selected].key as Screen);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        SA Configuration
      </Text>
      <Text />
      {MENU_ITEMS.map((item, i) => {
        let detail = "";
        if (item.key === "providers") detail = ` (${config.providers.length} configured)`;
        if (item.key === "models") detail = ` (${config.models.length} configured, default: ${config.defaultModel})`;
        if (item.key === "memory") detail = config.runtime.memory.enabled ? " (enabled)" : " (disabled)";

        return (
          <Text key={item.key}>
            {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
            {item.label}
            <Text dimColor>{detail}</Text>
          </Text>
        );
      })}
      <Text />
      <Text dimColor>↑↓ navigate | Enter select | Esc quit</Text>
    </Box>
  );
}
