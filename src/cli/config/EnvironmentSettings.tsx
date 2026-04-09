import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { AriaConfigFile } from "@aria/engine/config/index.js";
import { loadSecrets, saveSecrets } from "@aria/engine/config/secrets.js";
import type { SecretsFile } from "@aria/engine/config/types.js";

type Screen = "menu" | "variables" | "secrets";
type ListMode = "list" | "edit-value" | "add-name" | "add-value" | "confirm-delete";

interface EnvironmentSettingsProps {
  config: AriaConfigFile;
  homeDir: string;
  onSave: (config: AriaConfigFile) => Promise<void>;
  onBack: () => void;
}

interface KVEntry {
  key: string;
  value: string;
}

function KVListEditor({
  title,
  entries,
  onSave,
  onDelete,
  onAdd,
  onBack,
  maskValues,
}: {
  title: string;
  entries: KVEntry[];
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onAdd: (key: string, value: string) => Promise<void>;
  onBack: () => void;
  maskValues?: boolean;
}) {
  const [mode, setMode] = useState<ListMode>("list");
  const [selected, setSelected] = useState(0);
  const [editValue, setEditValue] = useState("");
  const [addName, setAddName] = useState("");
  const [saving, setSaving] = useState(false);

  // Items: all entries + a "+ Add new" row
  const itemCount = entries.length + 1;
  const isAddRow = selected === entries.length;

  useInput((input, key) => {
    if (saving) return;

    // --- LIST ---
    if (mode === "list") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(itemCount - 1, s + 1)); return; }
      if (key.return) {
        if (isAddRow) {
          setAddName("");
          setMode("add-name");
        } else {
          setEditValue(entries[selected]!.value);
          setMode("edit-value");
        }
        return;
      }
      // 'd' or Delete to remove
      if ((input === "d" || key.delete) && !isAddRow && entries.length > 0) {
        setMode("confirm-delete");
        return;
      }
      return;
    }

    // --- CONFIRM DELETE ---
    if (mode === "confirm-delete") {
      if (input === "y" || input === "Y") {
        setSaving(true);
        onDelete(entries[selected]!.key).then(() => {
          setSaving(false);
          setSelected((s) => Math.min(s, entries.length - 2));
          setMode("list");
        });
        return;
      }
      setMode("list");
      return;
    }

    // --- EDIT VALUE ---
    if (mode === "edit-value") {
      if (key.escape) { setMode("list"); return; }
      if (key.return) {
        setSaving(true);
        onSave(entries[selected]!.key, editValue).then(() => {
          setSaving(false);
          setMode("list");
        });
        return;
      }
      if (key.backspace || key.delete) { setEditValue((v) => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) { setEditValue((v) => v + input); }
      return;
    }

    // --- ADD NAME ---
    if (mode === "add-name") {
      if (key.escape) { setMode("list"); return; }
      if (key.return) {
        if (!addName.trim()) return;
        setEditValue("");
        setMode("add-value");
        return;
      }
      if (key.backspace || key.delete) { setAddName((v) => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) { setAddName((v) => v + input); }
      return;
    }

    // --- ADD VALUE ---
    if (mode === "add-value") {
      if (key.escape) { setMode("add-name"); return; }
      if (key.return) {
        setSaving(true);
        onAdd(addName.trim(), editValue).then(() => {
          setSaving(false);
          setSelected(entries.length); // point to the new entry
          setMode("list");
        });
        return;
      }
      if (key.backspace || key.delete) { setEditValue((v) => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) { setEditValue((v) => v + input); }
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">{title}</Text>
      <Text />

      {mode === "list" && (
        <>
          {entries.map((entry, i) => {
            const display = maskValues ? "●●●●" + entry.value.slice(-4) : entry.value;
            return (
              <Text key={entry.key}>
                {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
                <Text bold>{entry.key}</Text>
                <Text dimColor> = {display}</Text>
              </Text>
            );
          })}
          <Text>
            {isAddRow ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
            <Text color="yellow">+ Add new</Text>
          </Text>
          <Text />
          <Text dimColor>↑↓ navigate | Enter edit/add | d delete | Esc back</Text>
        </>
      )}

      {mode === "confirm-delete" && (
        <>
          <Text>Delete <Text bold color="red">{entries[selected]?.key}</Text>? <Text dimColor>y/N</Text></Text>
        </>
      )}

      {mode === "edit-value" && (
        <>
          <Text bold>{entries[selected]?.key}</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Value: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {mode === "add-name" && (
        <>
          <Text bold>New entry</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Name: </Text>
            <Text>{addName}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to continue | Esc cancel</Text>
        </>
      )}

      {mode === "add-value" && (
        <>
          <Text bold>{addName.trim()}</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Value: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {saving && <Text color="yellow">Saving...</Text>}
    </Box>
  );
}

export function EnvironmentSettings({ config, homeDir, onSave, onBack }: EnvironmentSettingsProps) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [selected, setSelected] = useState(0);
  const [secrets, setSecrets] = useState<SecretsFile | null>(null);

  useEffect(() => {
    loadSecrets(homeDir).then((s) => setSecrets(s ?? { apiKeys: {} }));
  }, [homeDir]);

  const envEntries: KVEntry[] = Object.entries(config.runtime.env ?? {}).map(([key, value]) => ({ key, value }));
  const secretEntries: KVEntry[] = secrets
    ? Object.entries(secrets.apiKeys).map(([key, value]) => ({ key, value }))
    : [];

  const menuItems = [
    { key: "variables", label: "Variables", detail: `${envEntries.length}` },
    { key: "secrets", label: "Secrets", detail: `${secretEntries.length}` },
  ];

  useInput((_input, key) => {
    if (screen !== "menu") return;
    if (key.escape) { onBack(); return; }
    if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setSelected((s) => Math.min(menuItems.length - 1, s + 1)); return; }
    if (key.return) {
      setScreen(menuItems[selected]!.key as Screen);
    }
  });

  if (screen === "variables") {
    return (
      <KVListEditor
        title="Environment Variables"
        entries={envEntries}
        onSave={async (key, value) => {
          const env = { ...config.runtime.env, [key]: value };
          await onSave({ ...config, runtime: { ...config.runtime, env } });
        }}
        onDelete={async (key) => {
          const env = { ...config.runtime.env };
          delete env[key];
          await onSave({ ...config, runtime: { ...config.runtime, env } });
        }}
        onAdd={async (key, value) => {
          const env = { ...config.runtime.env, [key]: value };
          await onSave({ ...config, runtime: { ...config.runtime, env } });
        }}
        onBack={() => setScreen("menu")}
      />
    );
  }

  if (screen === "secrets") {
    if (!secrets) {
      return (
        <Box padding={1}>
          <Text>Loading secrets...</Text>
        </Box>
      );
    }
    return (
      <KVListEditor
        title="Secrets"
        entries={secretEntries}
        maskValues
        onSave={async (key, value) => {
          const updated = { ...secrets, apiKeys: { ...secrets.apiKeys, [key]: value } };
          await saveSecrets(homeDir, updated);
          setSecrets(updated);
        }}
        onDelete={async (key) => {
          const apiKeys = { ...secrets.apiKeys };
          delete apiKeys[key];
          const updated = { ...secrets, apiKeys };
          await saveSecrets(homeDir, updated);
          setSecrets(updated);
        }}
        onAdd={async (key, value) => {
          const updated = { ...secrets, apiKeys: { ...secrets.apiKeys, [key]: value } };
          await saveSecrets(homeDir, updated);
          setSecrets(updated);
        }}
        onBack={() => setScreen("menu")}
      />
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Environment</Text>
      <Text />
      {menuItems.map((item, i) => (
        <Text key={item.key}>
          {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
          {item.label}
          <Text dimColor> ({item.detail})</Text>
        </Text>
      ))}
      <Text />
      <Text dimColor>↑↓ navigate | Enter select | Esc back</Text>
    </Box>
  );
}
