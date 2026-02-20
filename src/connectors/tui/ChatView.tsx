import React from "react";
import { Box, Text } from "ink";

export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
}

interface ChatViewProps {
  messages: ChatMessage[];
  streamingText: string;
}

export function ChatView({ messages, streamingText }: ChatViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1}>
          <MessageBlock message={msg} />
        </Box>
      ))}
      {streamingText && (
        <Box marginBottom={1}>
          <Text color="green" bold>
            {"SA: "}
          </Text>
          <Text>{streamingText}</Text>
          <Text color="yellow">{"▊"}</Text>
        </Box>
      )}
    </Box>
  );
}

function MessageBlock({ message }: { message: ChatMessage }) {
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
            {"SA: "}
          </Text>
          <Text>{message.content}</Text>
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
