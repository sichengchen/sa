#!/usr/bin/env bun

import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRuntime } from "./runtime.js";
import { startServer } from "./server.js";
import { createEngineClient } from "@sa/shared/client.js";

const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");
const PID_FILE = join(saHome, "engine.pid");
const URL_FILE = join(saHome, "engine.url");

const port = process.env.SA_ENGINE_PORT
  ? parseInt(process.env.SA_ENGINE_PORT, 10)
  : undefined;

async function main() {
  console.log("SA Engine bootstrapping...");
  const runtime = await createRuntime();
  const server = await startServer(runtime, { port });

  // Write discovery files so `sa engine status` works regardless of how we were started
  const httpUrl = `http://127.0.0.1:${server.port}`;
  writeFileSync(PID_FILE, String(process.pid));
  writeFileSync(URL_FILE, httpUrl);

  // Build a loopback tRPC client for connectors running in-process
  const wsUrl = `ws://127.0.0.1:${server.port + 1}`;
  const token = runtime.auth.getMasterToken();
  const client = createEngineClient({ httpUrl, wsUrl, token });

  // Auto-start Telegram connector if bot token is configured
  const secrets = await runtime.config.loadSecrets();
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? secrets?.botToken;
  if (telegramToken) {
    const { TelegramConnector } = await import("@sa/connectors/telegram/transport.js");
    const connector = new TelegramConnector(client, {
      botToken: telegramToken,
      allowedChatId: secrets?.pairedChatId,
      pairingCode: secrets?.pairingCode,
      onPaired: async (chatId) => {
        const current = (await runtime.config.loadSecrets()) ?? { apiKeys: {} };
        await runtime.config.saveSecrets({ ...current, pairedChatId: chatId });
      },
    });
    connector.start().catch((err) => {
      console.error("Telegram connector failed to start:", err);
    });
  }

  // Discord connector now uses Chat SDK (webhook-based).
  // Start it separately via `sa discord` to run the webhook server.

  // Graceful shutdown
  function shutdown() {
    console.log("\nSA Engine shutting down...");
    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(URL_FILE); } catch {}
    // Force-exit after 5s if server.stop() hangs
    const forceTimer = setTimeout(() => process.exit(1), 5000);
    server.stop().then(
      () => { clearTimeout(forceTimer); process.exit(0); },
      () => { clearTimeout(forceTimer); process.exit(1); },
    );
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("SA Engine failed to start:", err);
  process.exit(1);
});
