import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { ChatView, type ChatMessage } from "./ChatView.js";
import { Input } from "./Input.js";
import { StatusBar } from "./StatusBar.js";
import { ModelPicker } from "./ModelPicker.js";
import { createTuiClient } from "./client.js";
import type { ModelConfig, ProviderConfig } from "../../engine/router/types.js";

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
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [agentName, setAgentName] = useState("SA");
  const [scrollOffset, setScrollOffset] = useState(0);

  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;
  const terminalCols = stdout?.columns ?? 80;
  // StatusBar: 3 lines (border + content + border), Input: 3 lines
  const chatHeight = Math.max(3, terminalRows - 6);

  // Connect to Engine on mount
  useEffect(() => {
    async function connect() {
      try {
        const ping = await client.health.ping.query();
        setConnected(true);
        setModelName(ping.model);
        setAgentName(ping.agentName);

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
      // Fetch models separately so failure doesn't block session creation
      try {
        const modelList = await client.model.list.query();
        setModels(modelList);
      } catch {}
    }
    connect();
  }, [client]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setScrollOffset(0);
  }, [messages.length]);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
      return;
    }
    if (key.ctrl && _input === "m" && !isStreaming) {
      setShowModelPicker((v) => !v);
    }
    if (key.upArrow) {
      setScrollOffset((v) => Math.min(v + 1, Math.max(0, messages.length - 1)));
    }
    if (key.downArrow) {
      setScrollOffset((v) => Math.max(0, v - 1));
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

      // Handle /model command — open model picker to switch
      if (text === "/model") {
        try {
          const freshModels = await client.model.list.query();
          setModels(freshModels);
        } catch {}
        setShowModelPicker(true);
        return;
      }

      // Handle /models command — list configured models with details
      if (text === "/models") {
        try {
          const modelList = await client.model.list.query();
          const lines = modelList.map((m: ModelConfig) => {
            const marker = m.name === modelName ? "●" : "○";
            const extras: string[] = [];
            if (m.temperature !== undefined) extras.push(`temp=${m.temperature}`);
            if (m.maxTokens !== undefined) extras.push(`max=${m.maxTokens}`);
            const suffix = extras.length > 0 ? `  (${extras.join(", ")})` : "";
            return `${marker} ${m.name}  ${m.provider} → ${m.model}${suffix}`;
          });
          setMessages((prev) => [
            ...prev,
            {
              role: "tool",
              content: `Models:\n${lines.join("\n")}`,
              toolName: "system",
            },
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setMessages((prev) => [...prev, { role: "error", content: msg }]);
        }
        return;
      }

      // Handle /provider command — list providers
      if (text === "/provider") {
        try {
          const providers = await client.provider.list.query();
          const lines = providers.map((p: ProviderConfig) => {
            const base = `• ${p.id} (${p.type}) — ${p.apiKeyEnvVar}`;
            return p.baseUrl ? `${base}  [${p.baseUrl}]` : base;
          });
          setMessages((prev) => [
            ...prev,
            {
              role: "tool",
              content: `Providers:\n${lines.join("\n")}`,
              toolName: "system",
            },
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setMessages((prev) => [...prev, { role: "error", content: msg }]);
        }
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
    async (name: string) => {
      setShowModelPicker(false);
      try {
        await client.model.switch.mutate({ name });
        setModelName(name);
        setMessages((prev) => [
          ...prev,
          { role: "tool", content: `Switched to model: ${name}`, toolName: "system" },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { role: "error", content: msg }]);
      }
    },
    [client],
  );

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        modelName={modelName}
        isStreaming={isStreaming}
        connected={connected}
      />
      <ChatView
        messages={messages}
        streamingText={streamingText}
        agentName={agentName}
        height={chatHeight}
        width={terminalCols}
        scrollOffset={scrollOffset}
      />
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
