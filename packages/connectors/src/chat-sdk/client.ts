import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createEngineClient } from "@aria/shared/client.js";
import { AuthManager } from "@aria/engine/auth.js";
import { getRuntimeHome } from "@aria/shared/brand.js";

const DEFAULT_HTTP_PORT = 7420;

function readEngineUrl(): string {
  const runtimeHome = getRuntimeHome();
  const urlFile = join(runtimeHome, "engine.url");
  if (existsSync(urlFile)) {
    return readFileSync(urlFile, "utf-8").trim();
  }
  return `http://127.0.0.1:${DEFAULT_HTTP_PORT}`;
}

/** Create a tRPC client for Chat SDK connectors */
export function createChatSDKClient() {
  const httpUrl = readEngineUrl();
  const url = new URL(httpUrl);
  const wsPort = parseInt(url.port, 10) + 1;
  const wsUrl = `ws://${url.hostname}:${wsPort}`;
  const token = AuthManager.readTokenFromFile() ?? undefined;

  return createEngineClient({ httpUrl, wsUrl, token });
}
