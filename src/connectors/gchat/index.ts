/**
 * Google Chat connector for Esperta Aria — uses Chat SDK's GChat adapter.
 */

import { Chat } from "chat";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { hasGChatCredentials, getMissingCredentials } from "./config.js";

export interface GChatConnectorOptions {
  webhookPort?: number;
}

export function createGChatConnector(options: GChatConnectorOptions = {}) {
  if (!hasGChatCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `Google Chat connector requires: ${missing.join(", ")}. ` +
      "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const chat = new Chat({
    userName: "aria",
    adapters: {
      gchat: createGoogleChatAdapter(),
    },
    state: createMemoryState(),
    streamingUpdateIntervalMs: 1000,
  });

  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "gchat",
    platformName: "gchat",
    attributeSender: true,
  });
  adapter.setup();

  return {
    chat,
    webhookHandler: (request: Request) => chat.webhooks.gchat(request),
  };
}

export async function startGChatConnector(port = 3422): Promise<void> {
  const { chat, webhookHandler } = createGChatConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/gchat" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Google Chat Connector", { status: 200 });
    },
  });

  console.log(`Google Chat connector listening on http://localhost:${server.port}/api/webhooks/gchat`);

  const shutdown = async () => {
    console.log("\nShutting down Google Chat connector...");
    await chat.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { hasGChatCredentials, getMissingCredentials } from "./config.js";
