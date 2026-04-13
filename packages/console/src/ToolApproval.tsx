import React from "react";
import { Box, Text, useInput } from "ink";

interface ToolApprovalProps {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  onApprove: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
  onAcceptForSession: (toolCallId: string) => void;
}

/** Format args as a concise one-liner */
function summarizeArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "exec" && typeof args.command === "string") return args.command;
  if (toolName === "exec_kill" && typeof args.handle === "string") return args.handle;
  if (typeof args.file_path === "string") return args.file_path;
  const json = JSON.stringify(args);
  return json.length > 120 ? json.slice(0, 120) + "..." : json;
}

export function ToolApproval({
  toolName,
  toolCallId,
  args,
  onApprove,
  onReject,
  onAcceptForSession,
}: ToolApprovalProps) {
  useInput((input, key) => {
    if (input === "y" || key.return) {
      onApprove(toolCallId);
    } else if (input === "n" || key.escape) {
      onReject(toolCallId);
    } else if (input === "a") {
      onAcceptForSession(toolCallId);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        Tool approval required
      </Text>
      <Text>
        <Text bold>{toolName}</Text>
        {": "}
        <Text dimColor>{summarizeArgs(toolName, args)}</Text>
      </Text>
      <Text>
        <Text color="green" bold>
          y
        </Text>
        {" approve  "}
        <Text color="red" bold>
          n
        </Text>
        {" reject  "}
        <Text color="cyan" bold>
          a
        </Text>
        {" allow for session"}
      </Text>
    </Box>
  );
}
