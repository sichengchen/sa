import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Session } from "@aria/protocol";

interface SessionPickerProps {
  sessions: Session[];
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
  onCancel: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffS = Math.floor((now - ts) / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function SessionPicker({
  sessions,
  activeSessionId,
  onSelect,
  onCancel,
}: SessionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(
      0,
      sessions.findIndex((s) => s.id === activeSessionId),
    ),
  );

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (sessions.length > 0) onSelect(sessions[selectedIndex].id);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(sessions.length - 1, i + 1));
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        Sessions (↑↓ navigate, Enter switch, Esc cancel)
      </Text>
      {sessions.length === 0 && <Text color="yellow">No active sessions.</Text>}
      {sessions.map((s, i) => (
        <Box key={s.id}>
          <Text color={i === selectedIndex ? "cyan" : undefined}>
            {i === selectedIndex ? "● " : "○ "}[{s.connectorType}] {s.id.slice(0, 8)}
            {s.id === activeSessionId ? " (current)" : ""}
            <Text dimColor> — {formatTime(s.lastActiveAt)}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}
