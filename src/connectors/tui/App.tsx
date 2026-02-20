import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, useApp, useInput } from "ink";
import { ChatView, type ChatMessage } from "./ChatView.js";
import { Input } from "./Input.js";
import { StatusBar } from "./StatusBar.js";
import { ModelPicker } from "./ModelPicker.js";
import { createTuiClient } from "./client.js";

type EngineClient = ReturnType<typeof createTuiClient>;

interface AppProps {
  client: EngineClient;
}

export function App({ client }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [modelName, setModelName] = useState("unknown");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [models, setModels] = useState<string[]>([]);

  // Connect to Engine on mount
  useEffect(() => {
    async function connect() {
      try {
        const ping = await client.health.ping.query();
        setConnected(true);
        setModelName(ping.model);

        const session = await client.session.create.mutate({
          connectorType: "tui",
          connectorId: `tui-${Date.now()}`,
        });
        setSessionId(session.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          { role: "error", content: `Failed to connect to Engine: ${msg}` },
        ]);
      }
    }
    connect();
  }, [client]);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
      return;
    }
    if (key.ctrl && _input === "m" && !isStreaming) {
      setShowModelPicker((v) => !v);
    }
  });

  const handleSubmit = useCallback(
    async (text: string) => {
      if (isStreaming || !sessionId) return;

      // Handle /new command (clear session)
      if (text === "/new") {
        try {
          await client.session.destroy.mutate({ sessionId });
          const session = await client.session.create.mutate({
            connectorType: "tui",
            connectorId: `tui-${Date.now()}`,
          });
          setSessionId(session.id);
          setMessages([]);
          setMessages([{ role: "tool", content: "New session started.", toolName: "system" }]);
        } catch {}
        return;
      }

      // Handle /status command
      if (text === "/status") {
        try {
          const ping = await client.health.ping.query();
          setMessages((prev) => [
            ...prev,
            {
              role: "tool",
              content: `Engine: ${ping.status} | Model: ${ping.model} | Sessions: ${ping.sessions} | Uptime: ${Math.floor(ping.uptime)}s`,
              toolName: "system",
            },
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setMessages((prev) => [...prev, { role: "error", content: msg }]);
        }
        return;
      }

      // Handle /model command
      if (text === "/model" || text === "/models") {
        setShowModelPicker(true);
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setIsStreaming(true);
      setStreamingText("");

      let fullText = "";

      try {
        // Use the subscription to stream events
        const subscription = client.chat.stream.subscribe(
          { sessionId, message: text },
          {
            onData(event) {
              switch (event.type) {
                case "text_delta":
                  fullText += event.delta;
                  setStreamingText(fullText);
                  break;
                case "tool_start":
                  setMessages((prev) => [
                    ...prev,
                    { role: "tool", content: `Calling ${event.name}...`, toolName: event.name },
                  ]);
                  break;
                case "tool_end":
                  setMessages((prev) => [
                    ...prev,
                    { role: "tool", content: event.content.slice(0, 500), toolName: event.name },
                  ]);
                  break;
                case "tool_approval_request":
                  // Auto-approve for TUI (local trust)
                  client.tool.approve.mutate({ toolCallId: event.id, approved: true });
                  break;
                case "done":
                  if (fullText) {
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: fullText },
                    ]);
                  }
                  setStreamingText("");
                  setIsStreaming(false);
                  break;
                case "error":
                  setMessages((prev) => [
                    ...prev,
                    { role: "error", content: event.message },
                  ]);
                  setStreamingText("");
                  setIsStreaming(false);
                  break;
              }
            },
            onError(err) {
              const msg = err instanceof Error ? err.message : String(err);
              setMessages((prev) => [...prev, { role: "error", content: msg }]);
              setStreamingText("");
              setIsStreaming(false);
            },
            onComplete() {
              if (fullText && isStreaming) {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: fullText },
                ]);
              }
              setStreamingText("");
              setIsStreaming(false);
            },
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { role: "error", content: msg }]);
        setStreamingText("");
        setIsStreaming(false);
      }
    },
    [client, sessionId, isStreaming],
  );

  const handleModelSelect = useCallback(
    (name: string) => {
      setShowModelPicker(false);
      setModelName(name);
      setMessages((prev) => [
        ...prev,
        { role: "tool", content: `Switched to model: ${name}`, toolName: "system" },
      ]);
    },
    [],
  );

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        modelName={modelName}
        isStreaming={isStreaming}
        connected={connected}
      />
      <ChatView messages={messages} streamingText={streamingText} />
      {showModelPicker ? (
        <ModelPicker
          models={models}
          activeModel={modelName}
          onSelect={handleModelSelect}
          onCancel={() => setShowModelPicker(false)}
        />
      ) : (
        <Input onSubmit={handleSubmit} disabled={isStreaming || !connected} />
      )}
    </Box>
  );
}
