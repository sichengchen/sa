import React from "react";
import { render } from "ink";
import { join } from "node:path";
import { homedir } from "node:os";
import { ensureEngine } from "./engine.js";
import { ConfigManager } from "../config/index.js";
import { createTuiClient } from "../connectors/tui/client.js";
import { App } from "../connectors/tui/App.js";

const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");

export async function tuiCommand(): Promise<void> {
  await ensureEngine();
  const client = createTuiClient();
  const { waitUntilExit } = render(React.createElement(App, { client }));
  await waitUntilExit();
}

export async function telegramCommand(): Promise<void> {
  await ensureEngine();

  const config = new ConfigManager(saHome);
  await config.load();
  const secrets = await config.loadSecrets();

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? secrets?.botToken;
  if (!botToken) {
    console.error("No Telegram bot token found. Set TELEGRAM_BOT_TOKEN or run the setup wizard.");
    process.exit(1);
  }

  const { createTelegramClient } = await import("../connectors/telegram/client.js");
  const { TelegramConnector } = await import("../connectors/telegram/transport.js");

  const client = createTelegramClient();
  const connector = new TelegramConnector(client, {
    botToken,
    allowedChatId: secrets?.pairedChatId,
    pairingCode: secrets?.pairingCode,
    onPaired: async (chatId) => {
      const current = (await config.loadSecrets()) ?? { apiKeys: {} };
      await config.saveSecrets({ ...current, pairedChatId: chatId });
    },
  });

  await connector.start();
}

export async function discordCommand(): Promise<void> {
  await ensureEngine();

  const config = new ConfigManager(saHome);
  await config.load();
  const secrets = await config.loadSecrets();

  const botToken = process.env.DISCORD_TOKEN ?? secrets?.discordToken;
  if (!botToken) {
    console.error("No Discord bot token found. Set DISCORD_TOKEN or run the setup wizard.");
    process.exit(1);
  }

  const { createDiscordClient } = await import("../connectors/discord/client.js");
  const { DiscordConnector } = await import("../connectors/discord/transport.js");

  const client = createDiscordClient();
  const connector = new DiscordConnector(client, {
    botToken,
    allowedGuildId: process.env.DISCORD_GUILD_ID ?? secrets?.discordGuildId,
  });

  await connector.start();
}
