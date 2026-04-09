import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { MessageBlock, type ChatMessage } from "./MessageBlock.js";
import { MarkdownText } from "./MarkdownText.js";
import { Input } from "./Input.js";
import { StatusBar } from "./StatusBar.js";
import { ModelPicker } from "./ModelPicker.js";
import { SessionPicker } from "./SessionPicker.js";
import { ToolApproval } from "./ToolApproval.js";
import { UserQuestion } from "./UserQuestion.js";
import { createTuiClient } from "./client.js";
import type { ModelConfig, ProviderConfig } from "@aria/engine/router/types.js";
import type { Session } from "@aria/shared/types.js";

type EngineClient = ReturnType<typeof createTuiClient>;

const TUI_COMMANDS = [
  "/new",
  "/stop",
  "/restart",
  "/shutdown",
  "/status",
  "/model",
  "/models",
  "/provider",
  "/sessions",
  "/archives",
  "/switch",
  "/search",
  "/history",
  "/automation",
  "/runs",
  "/approvals",
  "/memory",
  "/audit",
  "/rollback",
];

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
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agentName, setAgentName] = useState("Esperta Aria");
  const [sessionConnectorType, setSessionConnectorType] = useState("tui");
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    toolCallId: string;
    args: Record<string, unknown>;
  } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{
    questionId: string;
    question: string;
    options?: string[];
  } | null>(null);

  const msgIdRef = useRef(0);
  const nextId = () => ++msgIdRef.current;

  function addMessage(msg: Omit<ChatMessage, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  }

  // Connect to Engine on mount
  useEffect(() => {
    async function connect() {
      try {
        const ping = await client.health.ping.query();
        setConnected(true);
        setModelName(ping.model);
        setAgentName(ping.agentName);

        const { session } = await client.session.create.mutate({
          connectorType: "tui",
          prefix: "tui",
        });
        setSessionId(session.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addMessage({ role: "error", content: `Failed to connect to Engine: ${msg}` });
      }
      try {
        const modelList = await client.model.list.query();
        setModels(modelList);
      } catch {}
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
      setShowSessionPicker(false);
    }
    if (key.ctrl && _input === "s" && !isStreaming) {
      (async () => {
        try {
          const list = await client.session.list.query();
          setSessions(list);
        } catch {}
        setShowSessionPicker((v) => !v);
        setShowModelPicker(false);
      })();
    }
  });

  const handleSubmit = useCallback(
    async (text: string) => {
      if (isStreaming || !sessionId) return;

      // Handle /new command (clear session)
      if (text === "/new") {
        try {
          await client.session.destroy.mutate({ sessionId });
          const { session } = await client.session.create.mutate({
            connectorType: "tui",
            prefix: "tui",
          });
          setSessionId(session.id);
          setSessionConnectorType("tui");
          addMessage({ role: "tool", content: `New session started: ${session.id.slice(0, 12)}`, toolName: "system" });
        } catch {}
        return;
      }

      // Handle /stop command — abort current agent work
      if (text === "/stop") {
        try {
          if (sessionId) {
            const result = await client.chat.stop.mutate({ sessionId });
            addMessage({
              role: "tool",
              content: result.cancelled ? "Stopped all running tasks." : "Nothing running.",
              toolName: "system",
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        setStreamingText("");
        setIsStreaming(false);
        return;
      }

      // Handle /shutdown command — stop the engine completely
      if (text === "/shutdown") {
        try {
          addMessage({ role: "tool", content: "Shutting down Aria Runtime...", toolName: "system" });
          await client.engine.shutdown.mutate();
          setTimeout(() => exit(), 500);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /restart command — restart the engine
      if (text === "/restart") {
        try {
          addMessage({ role: "tool", content: "Restarting Aria Runtime...", toolName: "system" });
          await client.engine.restart.mutate();
          // Engine will shut down — exit TUI so user can reconnect
          setTimeout(() => exit(), 500);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /status command
      if (text === "/status") {
        try {
          const ping = await client.health.ping.query();
          addMessage({
            role: "tool",
            content: `Engine: ${ping.status} | Model: ${ping.model} | Sessions: ${ping.sessions} | Uptime: ${Math.floor(ping.uptime)}s`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
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
          addMessage({ role: "tool", content: `Models:\n${lines.join("\n")}`, toolName: "system" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
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
          addMessage({ role: "tool", content: `Providers:\n${lines.join("\n")}`, toolName: "system" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /sessions command — list or open picker
      if (text === "/sessions") {
        try {
          const list = await client.session.list.query();
          setSessions(list);
          setShowSessionPicker(true);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /switch <id> command — switch to a session by ID prefix
      if (text.startsWith("/switch ")) {
        const target = text.slice(8).trim();
        if (!target) {
          addMessage({ role: "error", content: "Usage: /switch <session-id>" });
          return;
        }
        try {
          const list = await client.session.list.query();
          const match = list.find((s: Session) => s.id.startsWith(target));
          if (!match) {
            addMessage({ role: "error", content: `No session found matching: ${target}` });
            return;
          }
          setSessionId(match.id);
          setSessionConnectorType(match.connectorType);
          // Load history
          const history = await client.chat.history.query({ sessionId: match.id });
          const historyMessages: ChatMessage[] = (history.messages as any[]).map((m: any) => ({
            id: nextId(),
            role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "tool",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          }));
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "tool", content: `Switched to session ${match.id.slice(0, 8)} [${match.connectorType}]`, toolName: "system" },
            ...historyMessages,
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /search <query> — search archived session transcripts
      if (text.startsWith("/search ")) {
        const query = text.slice(8).trim();
        if (!query) {
          addMessage({ role: "error", content: "Usage: /search <query>" });
          return;
        }
        try {
          const results = await client.session.search.query({ query, limit: 5 });
          if (results.length === 0) {
            addMessage({ role: "tool", content: `No archived sessions matched: ${query}`, toolName: "system" });
            return;
          }

          const lines = results.map((result: any, index: number) => {
            const snippet = (result.snippet || result.preview || result.summary || "").replace(/\s+/g, " ").trim();
            return `${index + 1}. ${result.sessionId} [${result.connectorType}] ${snippet}`;
          });
          addMessage({
            role: "tool",
            content: `Archive search for "${query}":\n${lines.join("\n")}\n\nUse /history <session-id> to inspect one result.`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /history <id> — load history from a live or archived session without switching
      if (text.startsWith("/history ")) {
        const target = text.slice(9).trim();
        if (!target) {
          addMessage({ role: "error", content: "Usage: /history <session-id>" });
          return;
        }
        try {
          const history = await client.chat.history.query({ sessionId: target });
          if ((history.messages as any[]).length === 0) {
            addMessage({ role: "tool", content: `No history found for session: ${target}`, toolName: "system" });
            return;
          }

          const historyMessages: ChatMessage[] = (history.messages as any[]).map((m: any) => ({
            id: nextId(),
            role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "tool",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            toolName: typeof m.toolName === "string" ? m.toolName : undefined,
          }));

          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "tool",
              content: `${history.archived ? "Opened archived history" : "Opened live history"} for ${target}`,
              toolName: "system",
            },
            ...historyMessages,
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      if (text === "/archives") {
        try {
          const archived = await client.session.listArchived.query({ limit: 10 });
          if (archived.length === 0) {
            addMessage({ role: "tool", content: "No archived sessions found.", toolName: "system" });
            return;
          }
          const lines = archived.map((entry: any, index: number) => {
            const preview = (entry.preview || entry.summary || "").replace(/\s+/g, " ").trim();
            return `${index + 1}. ${entry.sessionId} [${entry.connectorType}] ${preview}`;
          });
          addMessage({
            role: "tool",
            content: `Archived sessions:\n${lines.join("\n")}\n\nUse /history <session-id> to inspect one result.`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      if (text === "/automation") {
        try {
          const tasks = await client.automation.list.query();
          if (tasks.length === 0) {
            addMessage({ role: "tool", content: "No automation tasks found.", toolName: "system" });
            return;
          }
          const lines = tasks.map((task: any) => {
            const status = task.paused ? "paused" : task.enabled ? "active" : "disabled";
            const nextRun = task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : "n/a";
            const lastStatus = task.lastStatus ?? "n/a";
            return `[${task.taskType}] ${task.name} (${status}) next=${nextRun} last=${lastStatus}`;
          });
          addMessage({
            role: "tool",
            content: `Automation tasks:\n${lines.join("\n")}\n\nUse /runs [task-id-or-name] for recent executions.`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      if (text === "/runs" || text.startsWith("/runs ")) {
        const target = text === "/runs" ? "" : text.slice(6).trim();
        try {
          let taskId: string | undefined;
          if (target) {
            const tasks = await client.automation.list.query();
            const match = tasks.find((task: any) => (
              task.taskId.startsWith(target) || task.name === target || task.slug === target
            ));
            if (!match) {
              addMessage({ role: "error", content: `No automation task matched: ${target}` });
              return;
            }
            taskId = match.taskId;
          }

          const runs = await client.automation.runs.query(taskId ? { taskId, limit: 10 } : { limit: 10 });
          if (runs.length === 0) {
            addMessage({ role: "tool", content: "No automation runs found.", toolName: "system" });
            return;
          }

          const lines = runs.map((run: any) => {
            const startedAt = new Date(run.startedAt).toLocaleString();
            const summary = run.summary || run.errorMessage || "no summary";
            const attempts = run.maxAttempts > 1 ? ` attempt ${run.attemptNumber}/${run.maxAttempts}` : "";
            const delivery = run.deliveryStatus !== "not_requested"
              ? ` | delivery ${run.deliveryStatus}${run.deliveryError ? ` (${run.deliveryError})` : ""}`
              : "";
            return `[${run.taskType}] ${run.taskName} ${run.status}${attempts} @ ${startedAt}${delivery}\n  ${summary}`;
          });
          addMessage({
            role: "tool",
            content: `Automation runs:\n${lines.join("\n")}`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      if (text === "/approvals" || text.startsWith("/approvals ")) {
        const rest = text === "/approvals" ? "" : text.slice(11).trim();
        try {
          const approvals = await client.approval.list.query({
            sessionId: rest === "all" ? undefined : sessionId ?? undefined,
            status: "pending",
            limit: 10,
          });
          if (approvals.length === 0) {
            addMessage({ role: "tool", content: "No pending approvals found.", toolName: "system" });
            return;
          }
          const lines = approvals.map((approval: any) => (
            `${approval.sessionId} ${approval.toolName} ${JSON.stringify(approval.args).slice(0, 120)}`
          ));
          addMessage({
            role: "tool",
            content: `Pending approvals:\n${lines.join("\n")}`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      if (text === "/memory" || text.startsWith("/memory ")) {
        const rest = text === "/memory" ? "" : text.slice(8).trim();
        try {
          if (!rest) {
            const overview = await client.memory.overview.query();
            addMessage({
              role: "tool",
              content: [
                `Curated memory: ${overview.curatedLength} chars`,
                `Profile keys: ${overview.layers.profile.join(", ") || "none"}`,
                `Project keys: ${overview.layers.project.join(", ") || "none"}`,
                `Operational keys: ${overview.layers.operational.join(", ") || "none"}`,
                `Recent journals: ${overview.journals.join(", ") || "none"}`,
              ].join("\n"),
              toolName: "system",
            });
            return;
          }

          if (rest.startsWith("search ")) {
            const query = rest.slice(7).trim();
            if (!query) {
              addMessage({ role: "error", content: "Usage: /memory search <query>" });
              return;
            }
            const results = await client.memory.search.query({ query, limit: 8 });
            if (results.length === 0) {
              addMessage({ role: "tool", content: `No memory matches for: ${query}`, toolName: "system" });
              return;
            }
            const lines = results.map((result: any) => (
              `[${result.sourceType}] ${result.source} score=${result.score.toFixed(3)} ${result.content.replace(/\s+/g, " ").trim().slice(0, 120)}`
            ));
            addMessage({ role: "tool", content: `Memory search:\n${lines.join("\n")}`, toolName: "system" });
            return;
          }

          if (rest.startsWith("read ")) {
            const [, layer, ...keyParts] = rest.split(/\s+/);
            const key = keyParts.join(" ").trim();
            if (!layer || (layer !== "curated" && !key)) {
              addMessage({ role: "error", content: "Usage: /memory read <curated|profile|project|operational|journal> [key]" });
              return;
            }
            const result = await client.memory.read.query({
              layer: layer as any,
              key: key || undefined,
            });
            addMessage({
              role: "tool",
              content: result.content ?? `No ${layer} entry found.`,
              toolName: "system",
            });
            return;
          }

          if (["curated", "profile", "project", "operational", "journal"].includes(rest)) {
            const overview = await client.memory.overview.query();
            if (rest === "curated") {
              const result = await client.memory.read.query({ layer: "curated" });
              addMessage({
                role: "tool",
                content: result.content || "(curated memory is empty)",
                toolName: "system",
              });
              return;
            }

            const entries = rest === "journal" ? overview.journals : overview.layers[rest as "profile" | "project" | "operational"];
            addMessage({
              role: "tool",
              content: entries.length > 0 ? entries.join("\n") : `(no ${rest} entries)`,
              toolName: "system",
            });
            return;
          }

          addMessage({ role: "error", content: "Usage: /memory [profile|project|operational|journal|curated] | /memory read ... | /memory search ..." });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      if (text === "/audit" || text.startsWith("/audit ")) {
        const rest = text === "/audit" ? "" : text.slice(7).trim();
        const showAll = rest === "all";
        const maybeTail = !showAll && rest ? parseInt(rest, 10) : NaN;
        try {
          const entries = await client.audit.list.query({
            tail: Number.isNaN(maybeTail) ? 10 : maybeTail,
            session: showAll ? undefined : sessionId ?? undefined,
          });
          if (entries.length === 0) {
            addMessage({ role: "tool", content: "No audit entries found.", toolName: "system" });
            return;
          }
          const lines = entries.map((entry: any) => {
            const detail = entry.tool ?? entry.summary ?? entry.command ?? entry.url ?? "";
            return `${entry.ts.slice(0, 19).replace("T", " ")} ${entry.event} ${detail}`.trim();
          });
          addMessage({
            role: "tool",
            content: `Audit log${showAll ? "" : " (current session)"}:\n${lines.join("\n")}`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      // Handle /rollback, /rollback diff <hash>, /rollback <hash> [file]
      if (text === "/rollback" || text.startsWith("/rollback ")) {
        const rest = text === "/rollback" ? "" : text.slice(10).trim();
        try {
          if (!rest) {
            const result = await client.checkpoint.list.query({ sessionId: sessionId ?? undefined });
            if (result.checkpoints.length === 0) {
              addMessage({ role: "tool", content: `No checkpoints found for ${result.workingDir}`, toolName: "system" });
              return;
            }
            const lines = result.checkpoints.slice(0, 10).map((entry: any) => (
              `${entry.shortHash} ${new Date(entry.timestamp).toLocaleString()} ${entry.reason} (${entry.filesChanged}f +${entry.insertions}/-${entry.deletions})`
            ));
            addMessage({
              role: "tool",
              content: `Checkpoints for ${result.workingDir}:\n${lines.join("\n")}\n\nUse /rollback diff <hash> or /rollback <hash> [file].`,
              toolName: "system",
            });
            return;
          }

          if (rest.startsWith("diff ")) {
            const hash = rest.slice(5).trim();
            if (!hash) {
              addMessage({ role: "error", content: "Usage: /rollback diff <hash>" });
              return;
            }
            const result = await client.checkpoint.diff.query({ sessionId: sessionId ?? undefined, commitHash: hash });
            if (!result.success) {
              addMessage({ role: "error", content: result.error ?? "Failed to diff checkpoint." });
              return;
            }
            addMessage({
              role: "tool",
              content: `Checkpoint diff ${hash}:\n${(result.diff ?? "(no diff)").slice(0, 4000)}`,
              toolName: "system",
            });
            return;
          }

          const [commitHash, ...fileParts] = rest.split(/\s+/);
          if (!commitHash) {
            addMessage({ role: "error", content: "Usage: /rollback <hash> [file]" });
            return;
          }
          const filePath = fileParts.length > 0 ? fileParts.join(" ") : undefined;
          const result = await client.checkpoint.restore.mutate({
            sessionId: sessionId ?? undefined,
            commitHash,
            filePath,
          });
          if (!result.success) {
            addMessage({ role: "error", content: result.error ?? "Rollback failed." });
            return;
          }
          addMessage({
            role: "tool",
            content: filePath
              ? `Restored ${filePath} from checkpoint ${commitHash}.`
              : `Restored working tree from checkpoint ${commitHash}.`,
            toolName: "system",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage({ role: "error", content: msg });
        }
        return;
      }

      addMessage({ role: "user", content: text });
      setIsStreaming(true);
      setStreamingText("");

      let fullText = "";

      try {
        client.chat.stream.subscribe(
          { sessionId, message: text },
          {
            onData(event) {
              switch (event.type) {
                case "text_delta":
                  fullText += event.delta;
                  setStreamingText(fullText);
                  break;
                case "tool_start":
                  addMessage({ role: "tool", content: `Calling ${event.name}...`, toolName: event.name });
                  break;
                case "tool_end":
                  addMessage({ role: "tool", content: event.content.slice(0, 500), toolName: event.name });
                  break;
                case "tool_approval_request":
                  setPendingApproval({
                    toolName: event.name,
                    toolCallId: event.id,
                    args: event.args,
                  });
                  break;
                case "user_question":
                  setPendingQuestion({
                    questionId: event.id,
                    question: event.question,
                    options: event.options,
                  });
                  break;
                case "reaction":
                  addMessage({ role: "tool", content: event.emoji, toolName: "reaction" });
                  break;
                case "done":
                  if (fullText) {
                    addMessage({ role: "assistant", content: fullText });
                  }
                  setStreamingText("");
                  setIsStreaming(false);
                  break;
                case "error":
                  addMessage({ role: "error", content: event.message });
                  setStreamingText("");
                  setIsStreaming(false);
                  break;
              }
            },
            onError(err) {
              const msg = err instanceof Error ? err.message : String(err);
              addMessage({ role: "error", content: msg });
              setStreamingText("");
              setIsStreaming(false);
            },
            onComplete() {
              if (fullText && isStreaming) {
                addMessage({ role: "assistant", content: fullText });
              }
              setStreamingText("");
              setIsStreaming(false);
            },
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addMessage({ role: "error", content: msg });
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
        addMessage({ role: "tool", content: `Switched to model: ${name}`, toolName: "system" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addMessage({ role: "error", content: msg });
      }
    },
    [client],
  );

  const handleSessionSelect = useCallback(
    async (targetSessionId: string) => {
      setShowSessionPicker(false);
      if (targetSessionId === sessionId) return;
      try {
        const list = await client.session.list.query();
        const match = list.find((s: Session) => s.id === targetSessionId);
        if (!match) {
          addMessage({ role: "error", content: "Session no longer exists." });
          return;
        }
        setSessionId(match.id);
        setSessionConnectorType(match.connectorType);
        const history = await client.chat.history.query({ sessionId: match.id });
        const historyMessages: ChatMessage[] = (history.messages as any[]).map((m: any) => ({
          id: nextId(),
          role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "tool",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "tool", content: `Switched to session ${match.id.slice(0, 8)} [${match.connectorType}]`, toolName: "system" },
          ...historyMessages,
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addMessage({ role: "error", content: msg });
      }
    },
    [client, sessionId],
  );

  const handleToolApprove = useCallback(
    (toolCallId: string) => {
      client.tool.approve.mutate({ toolCallId, approved: true });
      setPendingApproval(null);
    },
    [client],
  );

  const handleToolReject = useCallback(
    (toolCallId: string) => {
      client.tool.approve.mutate({ toolCallId, approved: false });
      setPendingApproval(null);
    },
    [client],
  );

  const handleToolAcceptForSession = useCallback(
    (toolCallId: string) => {
      client.tool.acceptForSession.mutate({ toolCallId });
      setPendingApproval(null);
    },
    [client],
  );

  const handleQuestionAnswer = useCallback(
    (questionId: string, answer: string) => {
      client.question.answer.mutate({ id: questionId, answer });
      setPendingQuestion(null);
      addMessage({ role: "tool", content: `Answer: ${answer}`, toolName: "ask_user" });
    },
    [client],
  );

  const pickerOverlay = showModelPicker ? (
    <ModelPicker
      models={models}
      activeModel={modelName}
      onSelect={handleModelSelect}
      onCancel={() => setShowModelPicker(false)}
    />
  ) : showSessionPicker ? (
    <SessionPicker
      sessions={sessions}
      activeSessionId={sessionId ?? ""}
      onSelect={handleSessionSelect}
      onCancel={() => setShowSessionPicker(false)}
    />
  ) : null;

  return (
    <Box flexDirection="column">
      <Static items={messages}>
        {(msg) => (
          <Box key={msg.id} marginBottom={1}>
            <MessageBlock message={msg} agentName={agentName} />
          </Box>
        )}
      </Static>
      {streamingText && (
        <Box marginBottom={1}>
          <Text color="green" bold>
            {`${agentName}: `}
          </Text>
          <MarkdownText>{streamingText}</MarkdownText>
          <Text color="yellow">{"▊"}</Text>
        </Box>
      )}
      {pendingApproval ? (
        <ToolApproval
          toolName={pendingApproval.toolName}
          toolCallId={pendingApproval.toolCallId}
          args={pendingApproval.args}
          onApprove={handleToolApprove}
          onReject={handleToolReject}
          onAcceptForSession={handleToolAcceptForSession}
        />
      ) : pendingQuestion ? (
        <UserQuestion
          questionId={pendingQuestion.questionId}
          question={pendingQuestion.question}
          options={pendingQuestion.options}
          onAnswer={handleQuestionAnswer}
        />
      ) : pickerOverlay ?? (
        <Input onSubmit={handleSubmit} disabled={isStreaming || !connected} commands={TUI_COMMANDS} />
      )}
      <StatusBar
        modelName={modelName}
        isStreaming={isStreaming}
        connected={connected}
        sessionId={sessionId}
        connectorType={sessionConnectorType}
      />
    </Box>
  );
}
