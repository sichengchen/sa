import React from "react";
import { Box, Text } from "ink";
import { MarkdownText } from "./MarkdownText.js";

export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
}

interface ChatViewProps {
  messages: ChatMessage[];
  streamingText: string;
  agentName: string;
  height: number;
  width: number;
  scrollOffset: number;
}

/** Prefix length in columns for a given message role. */
function getMessagePrefixLen(msg: ChatMessage, agentName: string): number {
  switch (msg.role) {
    case "user":
      return 5; // "You: "
    case "assistant":
      return agentName.length + 2; // "Name: "
    case "tool":
      return (msg.toolName?.length ?? 4) + 3; // "[name] "
    case "error":
      return 7; // "Error: "
  }
}

/** Estimate how many terminal rows a message occupies (content + 1 row for marginBottom). */
function estimateMessageHeight(msg: ChatMessage, agentName: string, width: number): number {
  const prefixLen = getMessagePrefixLen(msg, agentName);
  const available = Math.max(1, width - prefixLen);
  let rows = 0;
  for (const line of msg.content.split("\n")) {
    rows += line.length === 0 ? 1 : Math.ceil(line.length / available);
  }
  return rows + 1; // +1 for marginBottom
}

export function ChatView({ messages, streamingText, agentName, height, width, scrollOffset }: ChatViewProps) {
  const showStreaming = streamingText && scrollOffset === 0;
  const endIdx = Math.max(0, messages.length - scrollOffset);

  // Walk backwards from endIdx to find a reasonable startIdx.
  // We render ~2x the viewport height worth of messages for safety (the
  // height estimation is approximate because Ink does word-wrapping, not
  // character-wrapping).  overflow="hidden" + justifyContent="flex-end"
  // clips any excess at the top and keeps the newest content pinned to the
  // bottom — exactly like a chat app should behave.
  let estimatedRows = 0;
  const targetRows = height * 2;
  let startIdx = endIdx;
  for (let i = endIdx - 1; i >= 0; i--) {
    estimatedRows += estimateMessageHeight(messages[i], agentName, width);
    startIdx = i;
    if (estimatedRows > targetRows) break;
  }

  const visibleMessages = messages.slice(startIdx, endIdx);

  return (
    <Box flexDirection="column" height={height} overflow="hidden" justifyContent="flex-end">
      {visibleMessages.map((msg, i) => (
        <Box key={startIdx + i} marginBottom={1}>
          <MessageBlock message={msg} agentName={agentName} />
        </Box>
      ))}
      {showStreaming && (
        <Box marginBottom={1}>
          <Text color="green" bold>
            {`${agentName}: `}
          </Text>
          <MarkdownText>{streamingText}</MarkdownText>
          <Text color="yellow">{"▊"}</Text>
        </Box>
      )}
      {scrollOffset > 0 && (
        <Text dimColor>{"↓ " + scrollOffset + " newer message" + (scrollOffset > 1 ? "s" : "") + " below"}</Text>
      )}
    </Box>
  );
}

function MessageBlock({ message, agentName }: { message: ChatMessage; agentName: string }) {
  switch (message.role) {
    case "user":
      return (
        <Box>
          <Text color="blue" bold>
            {"You: "}
          </Text>
          <Text>{message.content}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box>
          <Text color="green" bold>
            {`${agentName}: `}
          </Text>
          <MarkdownText>{message.content}</MarkdownText>
        </Box>
      );
    case "tool":
      return (
        <Box>
          <Text color="magenta" bold>
            {`[${message.toolName ?? "tool"}] `}
          </Text>
          <Text dimColor>{message.content}</Text>
        </Box>
      );
    case "error":
      return (
        <Box>
          <Text color="red" bold>
            {"Error: "}
          </Text>
          <Text color="red">{message.content}</Text>
        </Box>
      );
  }
}
