/**
 * Microsoft Teams connector for Esperta Aria — uses Chat SDK's Teams adapter.
 */

import { Chat } from "chat";
import { createTeamsAdapter } from "@chat-adapter/teams";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { installConnectorSignalHandlers, type ConnectorRuntimeHandle } from "../shared/runtime.js";
import { hasTeamsCredentials, getMissingCredentials } from "./config.js";

export interface TeamsConnectorOptions {
  webhookPort?: number;
}

export interface StartTeamsConnectorOptions {
  port?: number;
  registerSignalHandlers?: boolean;
}

export function createTeamsConnector(options: TeamsConnectorOptions = {}) {
  if (!hasTeamsCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `Teams connector requires: ${missing.join(", ")}. ` +
        "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const chat = new Chat({
    userName: "aria",
    adapters: {
      teams: createTeamsAdapter(),
    },
    state: createMemoryState(),
    streamingUpdateIntervalMs: 1000,
  });

  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "teams",
    platformName: "teams",
    attributeSender: true,
  });
  adapter.setup();

  return {
    chat,
    webhookHandler: (request: Request) => chat.webhooks.teams(request),
  };
}

export async function startTeamsConnector(
  options: number | StartTeamsConnectorOptions = {},
): Promise<ConnectorRuntimeHandle> {
  const resolved = typeof options === "number" ? { port: options } : options;
  const port = resolved.port ?? 3421;
  const registerSignalHandlers = resolved.registerSignalHandlers ?? true;
  const { chat, webhookHandler } = createTeamsConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/teams" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Teams Connector", { status: 200 });
    },
  });

  console.log(`Teams connector listening on http://localhost:${server.port}/api/webhooks/teams`);

  let cleanupSignals = () => {};
  const stop = async () => {
    cleanupSignals();
    await chat.shutdown();
    server.stop();
  };

  if (registerSignalHandlers) {
    cleanupSignals = installConnectorSignalHandlers("Teams", stop);
  }

  return {
    name: "teams",
    stop,
  };
}

export { hasTeamsCredentials, getMissingCredentials } from "./config.js";
