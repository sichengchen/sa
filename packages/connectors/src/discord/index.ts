/**
 * Discord connector for Esperta Aria — uses Chat SDK's Discord adapter.
 *
 * Replaces the old Discord.js connector. Bridges Discord events to Aria Runtime's
 * engine via the shared ChatSDKAdapter. Uses post+edit for streaming.
 *
 * Note: Audio transcription (voice messages) is not yet supported via
 * Chat SDK. This feature will be re-added when Chat SDK adds Discord
 * attachment support.
 */

import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { hasDiscordCredentials, getMissingCredentials } from "./config.js";

export interface DiscordConnectorOptions {
  webhookPort?: number;
}

export function createDiscordConnector(options: DiscordConnectorOptions = {}) {
  if (!hasDiscordCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `Discord connector requires: ${missing.join(", ")}. ` +
      "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const chat = new Chat({
    userName: "aria",
    adapters: {
      discord: createDiscordAdapter(),
    },
    state: createMemoryState(),
    streamingUpdateIntervalMs: 1000,
  });

  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "discord",
    platformName: "discord",
    attributeSender: true,
  });
  adapter.setup();

  return {
    chat,
    webhookHandler: (request: Request) => chat.webhooks.discord(request),
  };
}

export async function startDiscordConnector(port = 3423): Promise<void> {
  const { chat, webhookHandler } = createDiscordConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/discord" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Discord Connector", { status: 200 });
    },
  });

  console.log(`Discord connector listening on http://localhost:${server.port}/api/webhooks/discord`);

  const shutdown = async () => {
    console.log("\nShutting down Discord connector...");
    await chat.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { hasDiscordCredentials, getMissingCredentials } from "./config.js";
