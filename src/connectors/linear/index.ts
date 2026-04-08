/**
 * Linear connector for Esperta Aria — uses Chat SDK's Linear adapter.
 *
 * Handles mentions and reactions in Linear issues/comments.
 * Linear does not support streaming — responses are posted after completion.
 */

import { Chat } from "chat";
import { createLinearAdapter } from "@chat-adapter/linear";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { hasLinearCredentials, getMissingCredentials } from "./config.js";

export interface LinearConnectorOptions {
  webhookPort?: number;
}

export function createLinearConnector(options: LinearConnectorOptions = {}) {
  if (!hasLinearCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `Linear connector requires: ${missing.join(", ")}. ` +
      "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const chat = new Chat({
    userName: "aria",
    adapters: {
      linear: createLinearAdapter(),
    },
    state: createMemoryState(),
  });

  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "linear",
    platformName: "linear",
    attributeSender: true,
  });
  adapter.setup();

  return {
    chat,
    webhookHandler: (request: Request) => chat.webhooks.linear(request),
  };
}

export async function startLinearConnector(port = 3425): Promise<void> {
  const { chat, webhookHandler } = createLinearConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/linear" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Linear Connector", { status: 200 });
    },
  });

  console.log(`Linear connector listening on http://localhost:${server.port}/api/webhooks/linear`);

  const shutdown = async () => {
    console.log("\nShutting down Linear connector...");
    await chat.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { hasLinearCredentials, getMissingCredentials } from "./config.js";
