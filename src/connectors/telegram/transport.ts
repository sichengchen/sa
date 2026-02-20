import { Bot, type Context, InlineKeyboard } from "grammy";
import type { ProviderConfig } from "../../engine/router/types.js";
import { splitMessage, formatToolResult } from "./formatter.js";
import { createTelegramClient } from "./client.js";
import { markdownToHtml } from "../../shared/markdown.js";

const EDIT_THROTTLE_MS = 1000;

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

    // Message handler
    this.bot.on("message:text", async (ctx) => {
      if (!this.isAllowed(ctx.message.chat.id)) return;

      const userText = ctx.message.text;
      // Skip commands already handled above
      if (userText.startsWith("/")) return;

      await ctx.api.sendChatAction(ctx.message.chat.id, "typing");

      try {
        const sessionId = await this.ensureSession();
        let sentMsg: Awaited<ReturnType<typeof ctx.reply>> | null = null;
        let fullText = "";
        let lastEditTime = 0;

        const subscription = this.client.chat.stream.subscribe(
          { sessionId, message: userText },
          {
            onData: async (event) => {
              switch (event.type) {
                case "text_delta":
                  fullText += event.delta;
                  if (Date.now() - lastEditTime > EDIT_THROTTLE_MS && fullText.length > 0) {
                    const html = markdownToHtml(fullText.slice(0, 4096));
                    try {
                      if (!sentMsg) {
                        sentMsg = await ctx.reply(html, { parse_mode: "HTML" });
                      } else {
                        await ctx.api.editMessageText(
                          ctx.message.chat.id,
                          sentMsg.message_id,
                          html,
                          { parse_mode: "HTML" },
                        );
                      }
                      lastEditTime = Date.now();
                    } catch {}
                  }
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
                    .text("Reject", `reject:${event.id}`);
                  await ctx.reply(
                    `Tool: ${event.name}\nApprove execution?`,
                    { reply_markup: keyboard },
                  );
                  break;
                }

                case "done":
                  if (fullText) {
                    const htmlFull = markdownToHtml(fullText);
                    const chunks = splitMessage(htmlFull);
                    try {
                      if (!sentMsg) {
                        sentMsg = await ctx.reply(chunks[0]!, { parse_mode: "HTML" });
                      } else {
                        await ctx.api.editMessageText(
                          ctx.message.chat.id,
                          sentMsg.message_id,
                          chunks[0]!,
                          { parse_mode: "HTML" },
                        );
                      }
                    } catch {}
                    for (let i = 1; i < chunks.length; i++) {
                      await ctx.reply(chunks[i]!, { parse_mode: "HTML" });
                    }
                  }
                  break;

                case "error":
                  await ctx.reply(`Error: ${event.message}`);
                  break;
              }
            },
            onError: async (err) => {
              const msg = err instanceof Error ? err.message : String(err);
              await ctx.reply(`Error: ${msg}`);
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
