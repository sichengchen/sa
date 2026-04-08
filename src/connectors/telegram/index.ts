/**
 * Telegram connector for Esperta Aria — uses Chat SDK's Telegram adapter.
 *
 * Replaces the old Grammy-based connector. Bridges Telegram events to Aria Runtime's
 * engine via the shared ChatSDKAdapter. Uses webhook mode.
 *
 * Note: Audio transcription (voice messages) is not yet supported via
 * Chat SDK. This feature will be re-added when Chat SDK adds audio support.
 */

import { Chat, Card, CardText, Actions, Button } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { hasTelegramCredentials, getMissingCredentials } from "./config.js";

export interface TelegramConnectorOptions {
  webhookPort?: number;
  /** Restrict to a single Telegram chat after /pair */
  allowedChatId?: string;
  /** Pairing code for /pair command */
  pairingCode?: string;
}

export function createTelegramConnector(options: TelegramConnectorOptions = {}) {
  if (!hasTelegramCredentials()) {
    const missing = getMissingCredentials();
    throw new Error(
      `Telegram connector requires: ${missing.join(", ")}. ` +
      "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  let allowedChatId = options.allowedChatId;
  const pairingCode = options.pairingCode
    ?? process.env.ARIA_TELEGRAM_PAIRING_CODE;

  const chat = new Chat({
    userName: "aria",
    adapters: {
      telegram: createTelegramAdapter({
        botToken: process.env.TELEGRAM_BOT_TOKEN!,
        secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
      }),
    },
    state: createMemoryState(),
    streamingUpdateIntervalMs: 1000,
  });

  const adapter = new ChatSDKAdapter(chat, {
    connectorType: "telegram",
    platformName: "telegram",
    attributeSender: true,
    onToolApprovalRequest: async (thread, toolName, toolCallId) => {
      // Use Chat SDK Card/Button API — rendered as inline keyboard by @chat-adapter/telegram
      await thread.post({
        card: Card({
          title: `Tool: ${toolName}`,
          children: [
            CardText("Approve execution?"),
            Actions([
              Button({ id: "approve", label: "Approve", value: toolCallId }),
              Button({ id: "reject", label: "Reject", value: toolCallId }),
              Button({ id: "always", label: `Always allow ${toolName}`, value: toolCallId }),
            ]),
          ],
        }),
      });
      return true;
    },
    onUserQuestion: async (thread, event) => {
      if (event.options && event.options.length > 0) {
        await thread.post({
          card: Card({
            title: event.question,
            children: [
              Actions(
                event.options.map((opt) =>
                  Button({ id: "answer", label: opt, value: `${event.id}:${opt}` }),
                ),
              ),
            ],
          }),
        });
        return true;
      }
      // Free-text questions: fall back to default text-based behavior
      return false;
    },
  });

  // Handle /pair command before adapter.setup()
  chat.onSubscribedMessage(async (thread, message) => {
    const text = message.text?.trim();
    if (!text) return;

    const pairMatch = text.match(/^\/pair\s+(.+)/);
    if (pairMatch && pairingCode) {
      const supplied = pairMatch[1]!.trim();
      if (supplied.toUpperCase() !== pairingCode.toUpperCase()) {
        await thread.post("Invalid pairing code.");
        return;
      }
      allowedChatId = thread.channelId;
      await thread.post("Paired! I will only respond to you from now on.");
      return;
    }

    // Filter messages to allowed chat
    if (allowedChatId && thread.channelId !== allowedChatId) return;
  });

  adapter.setup();

  return {
    chat,
    webhookHandler: (request: Request) => chat.webhooks.telegram(request),
  };
}

export async function startTelegramConnector(port = 3426): Promise<void> {
  const { chat, webhookHandler } = createTelegramConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/telegram" && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Telegram Connector", { status: 200 });
    },
  });

  console.log(`Telegram connector listening on http://localhost:${server.port}/api/webhooks/telegram`);

  const shutdown = async () => {
    console.log("\nShutting down Telegram connector...");
    await chat.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { hasTelegramCredentials, getMissingCredentials } from "./config.js";
