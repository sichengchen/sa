import { Bot, type Context, InlineKeyboard } from "grammy";
import type { ProviderConfig } from "../../engine/router/types.js";
import { splitMessage, formatToolResult } from "./formatter.js";
import { createTelegramClient } from "./client.js";
import { markdownToHtml } from "../../shared/markdown.js";
import { createStreamHandler } from "../shared/stream-handler.js";

type EngineClient = ReturnType<typeof createTelegramClient>;

export interface TelegramConnectorOptions {
  botToken: string;
  allowedChatId?: number;
  /** Pairing code for /pair command — pairs with Engine auth */
  pairingCode?: string;
  onPaired?: (chatId: number) => Promise<void>;
}

export class TelegramConnector {
  private bot: Bot;
  private client: EngineClient;
  private allowedChatId?: number;
  private pairingCode?: string;
  private onPaired?: (chatId: number) => Promise<void>;
  private sessionId: string | null = null;
  /** Track last user message for emoji reactions */
  private lastUserMessageId: number | null = null;
  private lastUserChatId: number | null = null;

  constructor(client: EngineClient, options: TelegramConnectorOptions) {
    this.bot = new Bot(options.botToken);
    this.client = client;
    this.allowedChatId = options.allowedChatId;
    this.pairingCode = options.pairingCode;
    this.onPaired = options.onPaired;
    this.setupHandlers();
  }

  private isAllowed(chatId: number): boolean {
    return this.allowedChatId === undefined || this.allowedChatId === chatId;
  }

  private async ensureSession(): Promise<string> {
    if (!this.sessionId) {
      const session = await this.client.session.create.mutate({
        connectorType: "telegram",
        connectorId: `telegram-${Date.now()}`,
      });
      this.sessionId = session.id;
    }
    return this.sessionId;
  }

  private setupHandlers(): void {
    // /pair command
    this.bot.command("pair", async (ctx) => {
      if (!this.pairingCode) {
        await ctx.reply("No pairing code configured. Run the setup wizard first.");
        return;
      }
      const supplied = ctx.match?.trim();
      if (!supplied) {
        await ctx.reply("Usage: /pair <code>");
        return;
      }
      if (supplied.toUpperCase() !== this.pairingCode.toUpperCase()) {
        await ctx.reply("Invalid pairing code.");
        return;
      }
      const chatId = ctx.message!.chat.id;
      this.allowedChatId = chatId;
      if (this.onPaired) {
        try { await this.onPaired(chatId); } catch {}
      }
      await ctx.reply("Paired! I will only respond to you from now on.");
    });

    // /new command — clear session
    this.bot.command("new", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      if (this.sessionId) {
        try { await this.client.session.destroy.mutate({ sessionId: this.sessionId }); } catch {}
      }
      this.sessionId = null;
      await ctx.reply("New session started.");
    });

    // /status command
    this.bot.command("status", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      try {
        const ping = await this.client.health.ping.query();
        await ctx.reply(
          `Engine: ${ping.status}\nModel: ${ping.model}\nSessions: ${ping.sessions}\nUptime: ${Math.floor(ping.uptime)}s`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`Engine unreachable: ${msg}`);
      }
    });

    // /model command — list models with option to switch
    this.bot.command("model", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      try {
        const [activeRes, models] = await Promise.all([
          this.client.model.active.query(),
          this.client.model.list.query(),
        ]);
        const keyboard = new InlineKeyboard();
        for (const m of models) {
          const label = m.name === activeRes.name ? `✓ ${m.name}` : m.name;
          keyboard.text(label, `model:${m.name}`).row();
        }
        await ctx.reply(`Current model: ${activeRes.name}\n\nSwitch to:`, {
          reply_markup: keyboard,
        });
      } catch {
        await ctx.reply("Engine unreachable.");
      }
    });

    // /provider command — list configured providers
    this.bot.command("provider", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      try {
        const providers = await this.client.provider.list.query();
        const lines = providers.map((p: ProviderConfig) => `• ${p.id} (${p.type}) — ${p.apiKeyEnvVar}`);
        await ctx.reply(`Providers:\n${lines.join("\n")}`);
      } catch {
        await ctx.reply("Engine unreachable.");
      }
    });

    // Model switch callback queries
    this.bot.callbackQuery(/^model:(.+)$/, async (ctx) => {
      const name = ctx.match![1]!;
      try {
        await this.client.model.switch.mutate({ name });
        await ctx.answerCallbackQuery({ text: `Switched to ${name}` });
        await ctx.editMessageText(`Switched to model: ${name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.answerCallbackQuery({ text: `Error: ${msg}` });
      }
    });

    // Tool approval callback queries
    this.bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
      const toolCallId = ctx.match![1]!;
      await this.client.tool.approve.mutate({ toolCallId, approved: true });
      await ctx.answerCallbackQuery({ text: "Approved" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    });

    this.bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
      const toolCallId = ctx.match![1]!;
      await this.client.tool.approve.mutate({ toolCallId, approved: false });
      await ctx.answerCallbackQuery({ text: "Rejected" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    });

    this.bot.callbackQuery(/^always:(.+)$/, async (ctx) => {
      const toolCallId = ctx.match![1]!;
      await this.client.tool.acceptForSession.mutate({ toolCallId });
      await ctx.answerCallbackQuery({ text: "Always allowed for this session" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    });

    // Message handler
    this.bot.on("message:text", async (ctx) => {
      if (!this.isAllowed(ctx.message.chat.id)) return;

      const userText = ctx.message.text;
      // Skip commands already handled above
      if (userText.startsWith("/")) return;

      // Track last user message for reactions
      this.lastUserMessageId = ctx.message.message_id;
      this.lastUserChatId = ctx.message.chat.id;

      await ctx.api.sendChatAction(ctx.message.chat.id, "typing");

      try {
        const sessionId = await this.ensureSession();

        type TgMsg = Awaited<ReturnType<typeof ctx.reply>>;
        const { handleTextDelta, handleDone, handleError } = createStreamHandler<TgMsg>({
          send: (content) => ctx.reply(content, { parse_mode: "HTML" }),
          edit: (msg, content) =>
            ctx.api.editMessageText(ctx.message.chat.id, msg.message_id, content, {
              parse_mode: "HTML",
            }).then(() => {}),
          sendExtra: (content) => ctx.reply(content, { parse_mode: "HTML" }).then(() => {}),
          format: (text) => markdownToHtml(text.slice(0, 4096)),
          split: (text) => splitMessage(text),
          sendError: (message) => ctx.reply(`Error: ${message}`).then(() => {}),
        });

        const subscription = this.client.chat.stream.subscribe(
          { sessionId, message: userText },
          {
            onData: async (event) => {
              switch (event.type) {
                case "text_delta":
                  handleTextDelta(event.delta);
                  break;

                case "tool_end": {
                  const toolMsg = formatToolResult(event.name, event.content);
                  try {
                    await ctx.reply(toolMsg, { parse_mode: "MarkdownV2" });
                  } catch {
                    await ctx.reply(`[${event.name}] ${event.content.slice(0, 500)}`);
                  }
                  break;
                }

                case "tool_approval_request": {
                  const keyboard = new InlineKeyboard()
                    .text("Approve", `approve:${event.id}`)
                    .text("Reject", `reject:${event.id}`)
                    .row()
                    .text(`Always allow ${event.name}`, `always:${event.id}`);
                  await ctx.reply(
                    `Tool: ${event.name}\nApprove execution?`,
                    { reply_markup: keyboard },
                  );
                  break;
                }

                case "reaction":
                  if (this.lastUserMessageId && this.lastUserChatId) {
                    try {
                      await ctx.api.setMessageReaction(this.lastUserChatId, this.lastUserMessageId, [
                        { type: "emoji", emoji: event.emoji as any },
                      ]);
                    } catch {
                      // Telegram may reject unsupported emoji — silently ignore
                    }
                  }
                  break;

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
        await ctx.reply(`Error: ${msg}`);
      }
    });

    // Voice and audio message handler
    this.bot.on(["message:voice", "message:audio"], async (ctx) => {
      if (!this.isAllowed(ctx.message.chat.id)) return;

      await ctx.api.sendChatAction(ctx.message.chat.id, "typing");

      try {
        const sessionId = await this.ensureSession();

        // Get file info and download
        const fileId = ctx.message.voice?.file_id ?? ctx.message.audio?.file_id;
        if (!fileId) {
          await ctx.reply("Could not read audio file.");
          return;
        }

        const file = await ctx.api.getFile(fileId);
        const filePath = file.file_path;
        if (!filePath) {
          await ctx.reply("Could not download audio file.");
          return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${filePath}`;
        const res = await fetch(fileUrl);
        if (!res.ok) {
          await ctx.reply("Failed to download audio file.");
          return;
        }

        const audioBuffer = Buffer.from(await res.arrayBuffer());
        const format = filePath.split(".").pop() ?? "ogg";
        const audioBase64 = audioBuffer.toString("base64");

        // Notify user transcription is in progress
        const transcribingMsg = await ctx.reply("Transcribing voice message...");

        type TgMsg = Awaited<ReturnType<typeof ctx.reply>>;
        const { handleTextDelta, handleDone, handleError } = createStreamHandler<TgMsg>({
          send: (content) => ctx.reply(content, { parse_mode: "HTML" }),
          edit: (msg, content) =>
            ctx.api.editMessageText(ctx.message.chat.id, msg.message_id, content, {
              parse_mode: "HTML",
            }).then(() => {}),
          sendExtra: (content) => ctx.reply(content, { parse_mode: "HTML" }).then(() => {}),
          format: (text) => markdownToHtml(text.slice(0, 4096)),
          split: (text) => splitMessage(text),
          sendError: (message) => ctx.reply(`Error: ${message}`).then(() => {}),
        });

        let transcriptShown = false;

        this.client.chat.transcribeAndSend.subscribe(
          { sessionId, audio: audioBase64, format },
          {
            onData: async (event: any) => {
              // First event with transcript metadata
              if (event.transcript && !transcriptShown) {
                transcriptShown = true;
                try {
                  await ctx.api.editMessageText(
                    ctx.message.chat.id,
                    transcribingMsg.message_id,
                    `🎤 "${event.transcript}"`,
                  );
                } catch {}
              }

              switch (event.type) {
                case "text_delta":
                  if (event.delta) handleTextDelta(event.delta);
                  break;

                case "tool_end": {
                  const toolMsg = formatToolResult(event.name, event.content);
                  try {
                    await ctx.reply(toolMsg, { parse_mode: "MarkdownV2" });
                  } catch {
                    await ctx.reply(`[${event.name}] ${event.content.slice(0, 500)}`);
                  }
                  break;
                }

                case "tool_approval_request": {
                  const keyboard = new InlineKeyboard()
                    .text("Approve", `approve:${event.id}`)
                    .text("Reject", `reject:${event.id}`)
                    .row()
                    .text(`Always allow ${event.name}`, `always:${event.id}`);
                  await ctx.reply(
                    `Tool: ${event.name}\nApprove execution?`,
                    { reply_markup: keyboard },
                  );
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
            onError: async (err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              await handleError(msg);
            },
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`Error: ${msg}`);
      }
    });

    this.bot.catch((err) => {
      console.error("Telegram bot error:", err);
    });
  }

  async start(): Promise<void> {
    await this.bot.api.setMyCommands([
      { command: "new", description: "Start a new session" },
      { command: "status", description: "Show engine status" },
      { command: "model", description: "List and switch models" },
      { command: "provider", description: "List configured providers" },
    ]);
    await this.bot.start({
      onStart: (botInfo) => {
        console.log(`Telegram Connector @${botInfo.username} started`);
      },
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
