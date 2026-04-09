/**
 * Slack connector for Esperta Aria — uses Chat SDK's Slack adapter.
 *
 * Bridges Slack events (mentions, messages, buttons, slash commands)
 * to Aria Runtime via the shared ChatSDKAdapter.
 */

import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { hasSlackCredentials, getMissingCredentials } from "./config.js";

export interface SlackConnectorOptions {
  /** Override webhook port (default: use Chat SDK's built-in handler) */
  webhookPort?: number;
}

/**
 * Create and start the Slack connector.
 *
 * Requires SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in env.
 * Returns the Chat instance and webhook handler for HTTP server integration.
 */
export function createSlackConnector(options: SlackConnectorOptions = {}) {
  if (!hasSlackCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `Slack connector requires: ${missing.join(", ")}. ` +
      "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const chat = new Chat({
    userName: "aria",
    adapters: {
      slack: createSlackAdapter(),
    },
    state: createMemoryState(),
    streamingUpdateIntervalMs: 500,
  });

  // Wire Aria Runtime bridge
  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "slack",
    platformName: "slack",
    attributeSender: true,
  });
  adapter.setup();

  return {
    chat,
    /** Webhook handler for Slack events — pass to your HTTP server */
    webhookHandler: (request: Request) => chat.webhooks.slack(request),
  };
}

/**
 * Start the Slack connector as a standalone webhook server.
 *
 * Starts a Bun HTTP server on the given port to handle Slack webhook events,
 * bridging them to Aria Runtime via tRPC.
 */
export async function startSlackConnector(port = 3420): Promise<void> {
  const { chat, webhookHandler } = createSlackConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/slack" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Slack Connector", { status: 200 });
    },
  });

  console.log(`Slack connector listening on http://localhost:${server.port}/api/webhooks/slack`);

  // Keep running until SIGINT/SIGTERM
  const shutdown = async () => {
    console.log("\nShutting down Slack connector...");
    await chat.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { hasSlackCredentials, getMissingCredentials } from "./config.js";
