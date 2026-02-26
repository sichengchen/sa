/**
 * ChatSDKAdapter — shared bridge between Chat SDK events and SA's tRPC engine.
 *
 * Wires Chat SDK event handlers (onNewMention, onSubscribedMessage, onAction,
 * etc.) to SA's tRPC client for session management, streaming, tool approval,
 * and slash commands. Platform-specific connectors instantiate this adapter
 * with their Chat SDK instance and configuration.
 */

import type { Chat, Thread, SentMessage, Adapter, Message as ChatMessage } from "chat";
import { createStreamHandler, type StreamOps } from "../shared/stream-handler.js";
import { formatToolResult, splitMessage, getMaxLength, formatSenderAttribution } from "./formatter.js";
import type { ConnectorType } from "@sa/shared/types.js";
import { createChatSDKClient } from "./client.js";

type EngineClient = ReturnType<typeof createChatSDKClient>;

export interface ChatSDKAdapterConfig {
  /** SA connector type for this platform */
  connectorType: ConnectorType;
  /** Platform name matching the Chat SDK adapter key (e.g. "slack", "discord") */
  platformName: string;
  /** Whether to attribute messages with sender names in group chats */
  attributeSender?: boolean;
}

/**
 * Bridges Chat SDK events to SA's tRPC engine.
 *
 * Usage:
 * ```ts
 * const chat = new Chat({ adapters: { slack: createSlackAdapter() }, ... });
 * const adapter = new ChatSDKAdapter(chat, { connectorType: "slack", platformName: "slack" });
 * adapter.setup();
 * ```
 */
export class ChatSDKAdapter {
  private client: EngineClient;
  private chat: Chat;
  private config: ChatSDKAdapterConfig;

  /** Per-thread active session: Chat SDK threadId → SA sessionId */
  private activeSessions = new Map<string, string>();

  constructor(chat: Chat, config: ChatSDKAdapterConfig) {
    this.chat = chat;
    this.config = config;
    this.client = createChatSDKClient();
  }

  /** Wire all Chat SDK event handlers to SA engine */
  setup(): void {
    // New @-mention in an unsubscribed thread
    this.chat.onNewMention(async (thread, message) => {
      await thread.subscribe();
      await this.handleMessage(thread, message);
    });

    // Follow-up message in a subscribed thread
    this.chat.onSubscribedMessage(async (thread, message) => {
      await this.handleMessage(thread, message);
    });

    // Button clicks for tool approval and model switching
    this.chat.onAction("approve", async (event) => {
      if (!event.value) return;
      try {
        await this.client.tool.approve.mutate({ toolCallId: event.value, approved: true });
        await event.thread.post("Tool approved.");
      } catch {
        await event.thread.post("Failed to process approval.");
      }
    });

    this.chat.onAction("reject", async (event) => {
      if (!event.value) return;
      try {
        await this.client.tool.approve.mutate({ toolCallId: event.value, approved: false });
        await event.thread.post("Tool rejected.");
      } catch {
        await event.thread.post("Failed to process rejection.");
      }
    });

    this.chat.onAction("always", async (event) => {
      if (!event.value) return;
      try {
        await this.client.tool.acceptForSession.mutate({ toolCallId: event.value });
        await event.thread.post("Tool always allowed for this session.");
      } catch {
        await event.thread.post("Failed to process.");
      }
    });

    this.chat.onAction("model", async (event) => {
      if (!event.value) return;
      try {
        await this.client.model.switch.mutate({ name: event.value });
        await event.thread.post(`Switched to model: **${event.value}**`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await event.thread.post(`Failed to switch model: ${msg}`);
      }
    });
  }

  /** Get or create an SA session for a Chat SDK thread */
  private async ensureSession(thread: Thread): Promise<string> {
    const threadId = thread.id;
    const existing = this.activeSessions.get(threadId);
    if (existing) return existing;

    const prefix = `${this.config.connectorType}:${thread.channelId}`;

    // Try to resume existing session on the engine
    const latest = await this.client.session.getLatest.query({ prefix });
    if (latest) {
      this.activeSessions.set(threadId, latest.id);
      return latest.id;
    }

    // Create a new session
    const { session } = await this.client.session.create.mutate({
      connectorType: this.config.connectorType,
      prefix,
    });
    this.activeSessions.set(threadId, session.id);
    return session.id;
  }

  /** Handle an incoming message — route to SA engine and stream back */
  private async handleMessage(thread: Thread, message: ChatMessage): Promise<void> {
    const text = message.text?.trim();
    if (!text) return;

    // Handle slash-style commands embedded in text
    if (await this.handleCommand(thread, text)) return;

    try {
      const sessionId = await this.ensureSession(thread);
      const maxLen = getMaxLength(this.config.platformName);

      // Sender attribution for group chats
      const isDM = thread.isDM;
      const messageForEngine = !isDM && this.config.attributeSender !== false
        ? formatSenderAttribution(message.author.fullName ?? "User", text)
        : text;

      // Create stream handler adapted for Chat SDK's Thread API
      const ops: StreamOps<SentMessage> = {
        send: (content) => thread.post(content),
        edit: (msg, content) => msg.edit(content).then(() => {}),
        sendExtra: (content) => thread.post(content).then(() => {}),
        format: (t) => t.slice(0, maxLen),
        split: (t) => splitMessage(t, maxLen),
        sendError: (msg) => thread.post(`Error: ${msg}`).then(() => {}),
      };

      const { handleTextDelta, handleDone, handleError } = createStreamHandler(ops);

      // Track last message for reactions
      let lastSentMessageId: string | undefined;

      this.client.chat.stream.subscribe(
        { sessionId, message: messageForEngine },
        {
          onData: async (event) => {
            switch (event.type) {
              case "text_delta":
                handleTextDelta(event.delta);
                break;

              case "tool_end": {
                const toolMsg = formatToolResult(event.name, event.content);
                await thread.post(toolMsg);
                break;
              }

              case "tool_approval_request": {
                await this.sendToolApprovalCard(thread, event.name, event.id);
                break;
              }

              case "reaction": {
                // React to the original message if possible
                try {
                  await thread.post(event.emoji);
                } catch {
                  // Platform may not support this emoji — silently ignore
                }
                break;
              }

              case "done":
                handleDone();
                break;

              case "error":
                await handleError(event.message);
                break;
            }
          },
          onError: async (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            await handleError(msg);
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await thread.post(`Error: ${msg}`);
    }
  }

  /** Send a tool approval card with Approve/Reject/Always buttons */
  private async sendToolApprovalCard(thread: Thread, toolName: string, toolCallId: string): Promise<void> {
    // Use markdown with button action IDs — Chat SDK's Card/Button JSX
    // requires @jsxImportSource chat which we avoid for pure TS.
    // Instead, post a text message with tool info.
    // Individual platform connectors can override with native cards.
    await thread.post(
      `**Tool: ${toolName}** — Approve execution?\n` +
      `Reply with: \`approve ${toolCallId.slice(0, 8)}\` / \`reject ${toolCallId.slice(0, 8)}\``,
    );

    // Store the full tool call ID for text-based approval matching
    this.pendingApprovals.set(toolCallId.slice(0, 8), toolCallId);
  }

  /** Pending tool approval IDs: short prefix → full toolCallId */
  private pendingApprovals = new Map<string, string>();

  /** Handle text-based slash commands. Returns true if handled. */
  private async handleCommand(thread: Thread, text: string): Promise<boolean> {
    // Text-based approval commands
    const approveMatch = text.match(/^approve\s+(\w+)/i);
    if (approveMatch) {
      const fullId = this.pendingApprovals.get(approveMatch[1]!);
      if (fullId) {
        this.pendingApprovals.delete(approveMatch[1]!);
        await this.client.tool.approve.mutate({ toolCallId: fullId, approved: true });
        await thread.post("Tool approved.");
        return true;
      }
    }

    const rejectMatch = text.match(/^reject\s+(\w+)/i);
    if (rejectMatch) {
      const fullId = this.pendingApprovals.get(rejectMatch[1]!);
      if (fullId) {
        this.pendingApprovals.delete(rejectMatch[1]!);
        await this.client.tool.approve.mutate({ toolCallId: fullId, approved: false });
        await thread.post("Tool rejected.");
        return true;
      }
    }

    if (text === "/stop") {
      try {
        const sessionId = this.activeSessions.get(thread.id);
        if (sessionId) {
          const result = await this.client.chat.stop.mutate({ sessionId });
          await thread.post(result.cancelled ? "Stopped all running tasks." : "Nothing running.");
        } else {
          // No active session — try stopAll as fallback
          const result = await this.client.chat.stopAll.mutate();
          await thread.post(result.cancelled > 0
            ? `Stopped ${result.cancelled} running agent(s).`
            : "Nothing running.");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await thread.post(`Failed to stop: ${msg}`);
      }
      return true;
    }

    if (text === "/new") {
      const prefix = `${this.config.connectorType}:${thread.channelId}`;
      const { session } = await this.client.session.create.mutate({
        connectorType: this.config.connectorType,
        prefix,
      });
      this.activeSessions.set(thread.id, session.id);
      await thread.post("New session started.");
      return true;
    }

    if (text === "/status") {
      try {
        const ping = await this.client.health.ping.query();
        await thread.post(
          `Engine: ${ping.status} | Model: ${ping.model} | Sessions: ${ping.sessions} | Uptime: ${Math.floor(ping.uptime)}s`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await thread.post(`Engine unreachable: ${msg}`);
      }
      return true;
    }

    if (text === "/model") {
      try {
        const [activeRes, models] = await Promise.all([
          this.client.model.active.query(),
          this.client.model.list.query(),
        ]);
        const lines = models.map((m: { name: string }) =>
          m.name === activeRes.name ? `• **✓ ${m.name}**` : `• ${m.name}`,
        );
        await thread.post(
          `Current model: **${activeRes.name}**\n\n${lines.join("\n")}\n\nReply with \`/model <name>\` to switch.`,
        );
      } catch {
        await thread.post("Engine unreachable.");
      }
      return true;
    }

    const modelSwitch = text.match(/^\/model\s+(.+)$/);
    if (modelSwitch) {
      try {
        await this.client.model.switch.mutate({ name: modelSwitch[1]! });
        await thread.post(`Switched to model: **${modelSwitch[1]}**`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await thread.post(`Failed to switch: ${msg}`);
      }
      return true;
    }

    if (text === "/provider") {
      try {
        const providers = await this.client.provider.list.query();
        const lines = providers.map((p: { id: string; type: string; apiKeyEnvVar: string }) =>
          `• **${p.id}** (${p.type}) — \`${p.apiKeyEnvVar}\``,
        );
        await thread.post(`Providers:\n${lines.join("\n")}`);
      } catch {
        await thread.post("Engine unreachable.");
      }
      return true;
    }

    return false;
  }
}
