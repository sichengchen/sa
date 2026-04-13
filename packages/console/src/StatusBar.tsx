import { Text } from "ink";

interface StatusBarProps {
  modelName: string;
  isStreaming: boolean;
  connected: boolean;
  sessionId?: string | null;
  connectorType?: string;
}

export function StatusBar({
  modelName,
  isStreaming,
  connected,
  sessionId,
  connectorType,
}: StatusBarProps) {
  const sessionLabel = sessionId ? `${connectorType ?? "?"}:${sessionId.slice(0, 8)}` : "none";
  const dot = connected ? "●" : "○";
  const dotColor = connected ? "green" : "red";
  const status = isStreaming ? "streaming..." : "ready";
  const statusColor = isStreaming ? "yellow" : "green";

  return (
    <Text dimColor>
      <Text color={dotColor}>{dot}</Text>
      {` ${modelName} | ${sessionLabel} | `}
      <Text color={statusColor}>{status}</Text>
      {" | Ctrl+C: exit"}
    </Text>
  );
}
