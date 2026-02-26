import { Bot, type Context, InlineKeyboard } from "grammy";
import type { ProviderConfig } from "@sa/engine/router/types.js";
import { splitMessage, formatToolResult, shouldRespondInGroup, stripBotMention } from "./formatter.js";
import { createTelegramClient } from "./client.js";
import { markdownToHtml } from "@sa/shared/markdown.js";
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
  /** Per-chat active session: prefix → sessionId */
  private activeSessions = new Map<string, string>();
  /** Track last user message for emoji reactions */
  private lastUserMessageId: number | null = null;
  private lastUserChatId: number | null = null;
  /** Pending user questions: chatId → questionId (for free-text responses) */
  private pendingFreeTextQuestions = new Map<number, string>();

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

  private async ensureSession(chatId: number): Promise<string> {
    const prefix = `telegram:${chatId}`;
    const existing = this.activeSessions.get(prefix);
    if (existing) return existing;

    // Try to resume existing session on the engine
    const latest = await this.client.session.getLatest.query({ prefix });
    if (latest) {
      this.activeSessions.set(prefix, latest.id);
      return latest.id;
    }

    // Create a new session
    const { session } = await this.client.session.create.mutate({
      connectorType: "telegram",
      prefix,
    });
    this.activeSessions.set(prefix, session.id);
    return session.id;
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

    // /new command — start a fresh session for this chat
    this.bot.command("new", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      const chatId = ctx.message!.chat.id;
      const prefix = `telegram:${chatId}`;
      // Create a fresh session under the same prefix (old session preserved)
      const { session } = await this.client.session.create.mutate({
        connectorType: "telegram",
        prefix,
      });
      this.activeSessions.set(prefix, session.id);
      await ctx.reply("New session started.");
    });

    // /shutdown command — stop SA engine completely
    this.bot.command("shutdown", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      try {
        await ctx.reply("Shutting down SA engine...");
        await this.client.engine.shutdown.mutate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`Failed to shutdown: ${msg}`);
      }
    });

    // /restart command — restart SA engine
    this.bot.command("restart", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      try {
        await ctx.reply("Restarting SA engine...");
        await this.client.engine.restart.mutate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`Failed to restart: ${msg}`);
      }
    });

    // /stop command — cancel running agent work
    this.bot.command("stop", async (ctx) => {
      if (!this.isAllowed(ctx.message!.chat.id)) return;
      try {
        const chatId = ctx.message!.chat.id;
        const prefix = `telegram:${chatId}`;
        const sessionId = this.activeSessions.get(prefix);
        if (sessionId) {
          const result = await this.client.chat.stop.mutate({ sessionId });
          await ctx.reply(result.cancelled ? "Stopped all running tasks." : "Nothing running.");
        } else {
          const result = await this.client.chat.stopAll.mutate();
          await ctx.reply(result.cancelled > 0
            ? `Stopped ${result.cancelled} running agent(s).`
            : "Nothing running.");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`Failed to stop: ${msg}`);
      }
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

    // Question answer callback queries (multiple-choice)
    this.bot.callbackQuery(/^answer:([^:]+):(.+)$/, async (ctx) => {
      const questionId = ctx.match![1]!;
      const answer = ctx.match![2]!;
      try {
        await this.client.question.answer.mutate({ id: questionId, answer });
        await ctx.answerCallbackQuery({ text: "Answered" });
        await ctx.editMessageText(`Answer: ${answer}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.answerCallbackQuery({ text: `Error: ${msg}` });
      }
    });

    // Message handler
    this.bot.on("message:text", async (ctx) => {
      if (!this.isAllowed(ctx.message.chat.id)) return;

      let userText = ctx.message.text;
      // Skip commands already handled above
      if (userText.startsWith("/")) return;

      // Check if this is a response to a pending free-text question
      const chatId = ctx.message.chat.id;
      const pendingQuestionId = this.pendingFreeTextQuestions.get(chatId);
      if (pendingQuestionId) {
        this.pendingFreeTextQuestions.delete(chatId);
        try {
          await this.client.question.answer.mutate({ id: pendingQuestionId, answer: userText });
          await ctx.reply(`Answer recorded: ${userText.slice(0, 200)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await ctx.reply(`Failed to submit answer: ${msg}`);
        }
        return;
      }

      // Group chat gate: only respond when @mentioned or replied to
      const botInfo = this.bot.botInfo;
      if (botInfo && !shouldRespondInGroup({
        chatType: ctx.chat.type,
        entities: ctx.message.entities as Array<{ type: string; offset: number; length: number }> | undefined,
        text: userText,
        botUsername: botInfo.username,
        replyToMessageFromId: ctx.message.reply_to_message?.from?.id,
        botId: botInfo.id,
      })) return;

      // Strip @botname mention from text before forwarding to engine
      if (botInfo) {
        userText = stripBotMention(userText, botInfo.username);
      }
      if (!userText) return; // Empty after stripping mention

      // Track last user message for reactions
      this.lastUserMessageId = ctx.message.message_id;
      this.lastUserChatId = ctx.message.chat.id;

      await ctx.api.sendChatAction(ctx.message.chat.id, "typing");

      try {
        const sessionId = await this.ensureSession(ctx.message.chat.id);

        // Sender attribution for group chats
        const isGroupChat = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
        const messageForEngine = isGroupChat && ctx.from
          ? `[${ctx.from.first_name}]: ${userText}`
          : userText;

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
          { sessionId, message: messageForEngine },
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

                case "user_question": {
                  if (event.options && event.options.length > 0) {
                    // Multiple-choice: inline keyboard buttons
                    const qKeyboard = new InlineKeyboard();
                    for (const opt of event.options) {
                      qKeyboard.text(opt, `answer:${event.id}:${opt}`).row();
                    }
                    await ctx.reply(
                      `❓ ${event.question}`,
                      { reply_markup: qKeyboard },
                    );
                  } else {
                    // Free-text: send question and wait for next message
                    this.pendingFreeTextQuestions.set(ctx.message.chat.id, event.id);
                    await ctx.reply(`❓ ${event.question}\n\n(Reply with your answer)`);
                  }
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

      // Group chat gate: voice messages can only trigger via reply-to-bot
      const isGroupChat = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      if (isGroupChat) {
        const botInfo = this.bot.botInfo;
        const isReply = botInfo && ctx.message.reply_to_message?.from?.id === botInfo.id;
        if (!isReply) return;
      }

      await ctx.api.sendChatAction(ctx.message.chat.id, "typing");

      try {
        const sessionId = await this.ensureSession(ctx.message.chat.id);

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

                case "user_question": {
                  if (event.options && event.options.length > 0) {
                    const qKeyboard = new InlineKeyboard();
                    for (const opt of event.options) {
                      qKeyboard.text(opt, `answer:${event.id}:${opt}`).row();
                    }
                    await ctx.reply(`❓ ${event.question}`, { reply_markup: qKeyboard });
                  } else {
                    this.pendingFreeTextQuestions.set(ctx.message.chat.id, event.id);
                    await ctx.reply(`❓ ${event.question}\n\n(Reply with your answer)`);
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
      { command: "stop", description: "Stop all running tasks" },
      { command: "restart", description: "Restart the SA engine" },
      { command: "shutdown", description: "Stop the SA engine" },
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
