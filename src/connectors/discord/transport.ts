import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type Interaction,
} from "discord.js";
import { splitMessage, formatToolResult } from "./formatter.js";
import { createDiscordClient } from "./client.js";
import type { ProviderConfig } from "../../engine/router/types.js";
import { createStreamHandler } from "../shared/stream-handler.js";

type EngineClient = ReturnType<typeof createDiscordClient>;

export interface DiscordConnectorOptions {
  botToken: string;
  /** Restrict to a specific guild (server) ID */
  allowedGuildId?: string;
  /** Restrict to a specific channel ID */
  allowedChannelId?: string;
  /** Restrict to a specific user ID */
  allowedUserId?: string;
}

export class DiscordConnector {
  private discord: Client;
  private client: EngineClient;
  private options: DiscordConnectorOptions;
  private sessionId: string | null = null;

  constructor(client: EngineClient, options: DiscordConnectorOptions) {
    this.client = client;
    this.options = options;
    this.discord = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
    this.setupHandlers();
  }

  private isAllowed(message: Message): boolean {
    if (message.author.bot) return false;
    if (this.options.allowedUserId && message.author.id !== this.options.allowedUserId) return false;
    if (this.options.allowedGuildId && message.guildId !== this.options.allowedGuildId) return false;
    if (this.options.allowedChannelId && message.channelId !== this.options.allowedChannelId) return false;
    return true;
  }

  private async ensureSession(): Promise<string> {
    if (!this.sessionId) {
      const session = await this.client.session.create.mutate({
        connectorType: "discord",
        connectorId: `discord-${Date.now()}`,
      });
      this.sessionId = session.id;
    }
    return this.sessionId;
  }

  private setupHandlers(): void {
    this.discord.on("messageCreate", async (message) => {
      if (!this.isAllowed(message)) return;

      const text = message.content.trim();
      if (!text) return;

      // Slash commands
      if (text === "/new") {
        if (this.sessionId) {
          try { await this.client.session.destroy.mutate({ sessionId: this.sessionId }); } catch {}
        }
        this.sessionId = null;
        await message.reply("New session started.");
        return;
      }

      if (text === "/status") {
        try {
          const ping = await this.client.health.ping.query();
          await message.reply(
            `Engine: ${ping.status} | Model: ${ping.model} | Sessions: ${ping.sessions} | Uptime: ${Math.floor(ping.uptime)}s`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await message.reply(`Engine unreachable: ${msg}`);
        }
        return;
      }

      if (text === "/model") {
        try {
          const [activeRes, models] = await Promise.all([
            this.client.model.active.query(),
            this.client.model.list.query(),
          ]);
          const row = new ActionRowBuilder<ButtonBuilder>();
          for (const m of models.slice(0, 5)) {
            const label = m.name === activeRes.name ? `✓ ${m.name}` : m.name;
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`model:${m.name}`)
                .setLabel(label)
                .setStyle(m.name === activeRes.name ? ButtonStyle.Success : ButtonStyle.Secondary),
            );
          }
          await message.reply({
            content: `Current model: **${activeRes.name}**\n\nSwitch to:`,
            components: models.length > 0 ? [row] : [],
          });
        } catch {
          await message.reply("Engine unreachable.");
        }
        return;
      }

      if (text === "/provider") {
        try {
          const providers = await this.client.provider.list.query();
          const lines = providers.map((p: ProviderConfig) => `• **${p.id}** (${p.type}) — \`${p.apiKeyEnvVar}\``);
          await message.reply(`Providers:\n${lines.join("\n")}`);
        } catch {
          await message.reply("Engine unreachable.");
        }
        return;
      }

      // Regular chat
      try {
        const sessionId = await this.ensureSession();

        const { handleTextDelta, handleDone, handleError } = createStreamHandler<Message>({
          send: (content) => message.reply(content),
          edit: (msg, content) => msg.edit(content).then(() => {}),
          sendExtra: (content) => message.channel.send(content).then(() => {}),
          format: (text) => text.slice(0, 2000),
          split: (text) => splitMessage(text),
          sendError: (msg) => message.reply(`Error: ${msg}`).then(() => {}),
        });

        this.client.chat.stream.subscribe(
          { sessionId, message: text },
          {
            onData: async (event) => {
              switch (event.type) {
                case "text_delta":
                  handleTextDelta(event.delta);
                  break;

                case "tool_end": {
                  const toolMsg = formatToolResult(event.name, event.content);
                  await message.channel.send(toolMsg);
                  break;
                }

                case "tool_approval_request": {
                  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`approve:${event.id}`)
                      .setLabel("Approve")
                      .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                      .setCustomId(`reject:${event.id}`)
                      .setLabel("Reject")
                      .setStyle(ButtonStyle.Danger),
                  );
                  await message.channel.send({
                    content: `Tool: **${event.name}** — Approve execution?`,
                    components: [row],
                  });
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
        await message.reply(`Error: ${msg}`);
      }
    });

    // Button interaction handler for tool approvals and model switching
    this.discord.on("interactionCreate", async (interaction: Interaction) => {
      if (!interaction.isButton()) return;

      const colonIdx = interaction.customId.indexOf(":");
      const action = colonIdx >= 0 ? interaction.customId.slice(0, colonIdx) : interaction.customId;
      const value = colonIdx >= 0 ? interaction.customId.slice(colonIdx + 1) : "";

      if (action === "model" && value) {
        try {
          await this.client.model.switch.mutate({ name: value });
          await interaction.update({
            content: `Switched to model: **${value}**`,
            components: [],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await interaction.reply({ content: `Failed to switch: ${msg}`, ephemeral: true });
        }
        return;
      }

      if (action !== "approve" && action !== "reject") return;

      const approved = action === "approve";
      try {
        await this.client.tool.approve.mutate({ toolCallId: value, approved });
        await interaction.update({
          content: `Tool ${approved ? "approved" : "rejected"}.`,
          components: [],
        });
      } catch {
        await interaction.reply({ content: "Failed to process.", ephemeral: true });
      }
    });

    this.discord.on("ready", () => {
      console.log(`Discord Connector @${this.discord.user?.tag} started`);
    });
  }

  async start(): Promise<void> {
    await this.discord.login(this.options.botToken);
  }

  async stop(): Promise<void> {
    await this.discord.destroy();
  }
}
