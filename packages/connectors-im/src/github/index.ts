/**
 * GitHub connector for Esperta Aria — uses Chat SDK's GitHub adapter.
 *
 * Handles issue/PR mentions and reactions. GitHub does not support
 * streaming — responses are posted after completion.
 */

import { Chat } from "chat";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { hasGitHubCredentials, getMissingCredentials } from "./config.js";

export interface GitHubConnectorOptions {
  webhookPort?: number;
}

export function createGitHubConnector(options: GitHubConnectorOptions = {}) {
  if (!hasGitHubCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `GitHub connector requires: ${missing.join(", ")}. ` +
        "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const chat = new Chat({
    userName: "aria",
    adapters: {
      github: createGitHubAdapter(),
    },
    state: createMemoryState(),
  });

  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "github",
    platformName: "github",
    attributeSender: true,
  });
  adapter.setup();

  return {
    chat,
    webhookHandler: (request: Request) => chat.webhooks.github(request),
  };
}

export async function startGitHubConnector(port = 3424): Promise<void> {
  const { chat, webhookHandler } = createGitHubConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/github" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria GitHub Connector", { status: 200 });
    },
  });

  console.log(`GitHub connector listening on http://localhost:${server.port}/api/webhooks/github`);

  const shutdown = async () => {
    console.log("\nShutting down GitHub connector...");
    await chat.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { hasGitHubCredentials, getMissingCredentials } from "./config.js";
