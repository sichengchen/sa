import { Box, Text } from "ink";
import { MarkdownText } from "./MarkdownText.js";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
}

interface MessageBlockProps {
  message: ChatMessage;
  agentName: string;
}

export function MessageBlock({ message, agentName }: MessageBlockProps) {
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
