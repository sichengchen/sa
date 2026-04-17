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
import { installConnectorSignalHandlers, type ConnectorRuntimeHandle } from "../shared/runtime.js";
import { hasLinearCredentials, getMissingCredentials } from "./config.js";

export interface LinearConnectorOptions {
  webhookPort?: number;
}

export interface StartLinearConnectorOptions {
  port?: number;
  registerSignalHandlers?: boolean;
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

export async function startLinearConnector(
  options: number | StartLinearConnectorOptions = {},
): Promise<ConnectorRuntimeHandle> {
  const resolved = typeof options === "number" ? { port: options } : options;
  const port = resolved.port ?? 3425;
  const registerSignalHandlers = resolved.registerSignalHandlers ?? true;
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

  let cleanupSignals = () => {};
  const stop = async () => {
    cleanupSignals();
    await chat.shutdown();
    server.stop();
  };

  if (registerSignalHandlers) {
    cleanupSignals = installConnectorSignalHandlers("Linear", stop);
  }

  return {
    name: "linear",
    stop,
  };
}

export { hasLinearCredentials, getMissingCredentials } from "./config.js";
