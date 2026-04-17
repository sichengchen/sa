/**
 * Slack connector for Esperta Aria — uses Chat SDK's Slack adapter.
 *
 * Bridges Slack events (mentions, messages, buttons, slash commands)
 * to Aria Runtime via the shared ChatSDKAdapter.
 */

import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { ChatSDKAdapter } from "../chat-sdk/adapter.js";
import { installConnectorSignalHandlers, type ConnectorRuntimeHandle } from "../shared/runtime.js";
import {
  getMissingCredentials,
  getMissingSocketModeCredentials,
  hasSlackCredentials,
  hasSlackSocketModeCredentials,
} from "./config.js";

export interface SlackConnectorOptions {
  /** Override webhook port (default: use Chat SDK's built-in handler) */
  webhookPort?: number;
}

export type SlackConnectorMode = "webhook" | "socket";

export interface StartSlackConnectorOptions {
  mode?: SlackConnectorMode;
  port?: number;
  registerSignalHandlers?: boolean;
}

interface SlackSocketEnvelope {
  envelope_id?: string;
  payload?: unknown;
  type?: string;
  accepts_response_payload?: boolean;
  reason?: string;
}

const SLACK_WEBHOOK_PATH = "/api/webhooks/slack";
const SLACK_DEFAULT_PORT = 3420;
const SLACK_SOCKET_OPEN_URL = "https://slack.com/api/apps.connections.open";
const SLACK_SOCKET_RETRY_DELAY_MS = 3000;

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

function getSignedSlackHeaders(body: string): Headers {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.SLACK_SIGNING_SECRET ?? "";
  const base = `v0:${timestamp}:${body}`;
  const digest = createHmac("sha256", secret).update(base).digest("hex");
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-slack-request-timestamp", timestamp);
  headers.set("x-slack-signature", `v0=${digest}`);
  return headers;
}

function createSignedSlackRequest(body: string, contentType: string): Request {
  const headers = getSignedSlackHeaders(body);
  headers.set("content-type", contentType);
  return new Request(`http://localhost${SLACK_WEBHOOK_PATH}`, {
    method: "POST",
    headers,
    body,
  });
}

function createSlackSocketModeRequest(envelope: SlackSocketEnvelope): Request | null {
  switch (envelope.type) {
    case "events_api":
      return createSignedSlackRequest(JSON.stringify(envelope.payload ?? {}), "application/json");
    case "interactive": {
      const body = new URLSearchParams({
        payload: JSON.stringify(envelope.payload ?? {}),
      }).toString();
      return createSignedSlackRequest(body, "application/x-www-form-urlencoded");
    }
    case "slash_commands": {
      const params = new URLSearchParams();
      const payload = envelope.payload;
      if (payload && typeof payload === "object") {
        for (const [key, value] of Object.entries(payload)) {
          if (value == null) continue;
          params.set(key, typeof value === "string" ? value : JSON.stringify(value));
        }
      }
      return createSignedSlackRequest(params.toString(), "application/x-www-form-urlencoded");
    }
    default:
      return null;
  }
}

async function responsePayloadFromSlackWebhookResponse(
  response: Response,
  acceptsResponsePayload: boolean | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!acceptsResponsePayload) return undefined;

  const text = (await response.text()).trim();
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { text };
  }

  return { text };
}

async function openSlackSocketUrl(appToken: string): Promise<string> {
  const response = await fetch(SLACK_SOCKET_OPEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Slack Socket Mode open failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
  if (!payload.ok || !payload.url) {
    throw new Error(`Slack Socket Mode open failed: ${payload.error ?? "missing websocket URL"}`);
  }

  return payload.url;
}

async function processSlackSocketEnvelope(
  socket: WebSocket,
  envelope: SlackSocketEnvelope,
  webhookHandler: (request: Request) => Promise<Response>,
): Promise<void> {
  const envelopeId = envelope.envelope_id;
  if (!envelopeId) return;

  let responsePayload: Record<string, unknown> | undefined;

  try {
    const request = createSlackSocketModeRequest(envelope);
    if (request) {
      const response = await webhookHandler(request);
      responsePayload = await responsePayloadFromSlackWebhookResponse(
        response,
        envelope.accepts_response_payload,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Slack Socket Mode event handling failed: ${message}`);
  }

  socket.send(
    JSON.stringify(
      responsePayload
        ? { envelope_id: envelopeId, payload: responsePayload }
        : { envelope_id: envelopeId },
    ),
  );
}

async function runSlackSocketMode(
  webhookHandler: (request: Request) => Promise<Response>,
  signal: AbortSignal,
): Promise<void> {
  const appToken = process.env.SLACK_APP_TOKEN ?? "";

  while (!signal.aborted) {
    try {
      const socketUrl = await openSlackSocketUrl(appToken);
      console.log("Slack connector connected via Socket Mode");

      await new Promise<void>((resolve) => {
        const socket = new WebSocket(socketUrl);

        socket.onmessage = (event) => {
          void (async () => {
            const raw =
              typeof event.data === "string"
                ? event.data
                : Buffer.from(event.data as ArrayBufferLike).toString("utf-8");

            let envelope: SlackSocketEnvelope;
            try {
              envelope = JSON.parse(raw) as SlackSocketEnvelope;
            } catch {
              console.warn("Slack Socket Mode sent invalid JSON");
              return;
            }

            if (envelope.type === "hello") {
              return;
            }

            if (envelope.type === "disconnect") {
              console.log(
                `Slack Socket Mode disconnect requested: ${envelope.reason ?? "unknown"}`,
              );
              socket.close();
              return;
            }

            await processSlackSocketEnvelope(socket, envelope, webhookHandler);
          })();
        };

        socket.onerror = (event) => {
          console.warn(`Slack Socket Mode websocket error: ${String(event.type)}`);
        };

        socket.onclose = () => {
          resolve();
        };

        if (signal.aborted) {
          socket.close();
        } else {
          signal.addEventListener(
            "abort",
            () => {
              socket.close();
            },
            { once: true },
          );
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Slack Socket Mode connection failed: ${message}`);
    }

    if (!signal.aborted) {
      await delay(SLACK_SOCKET_RETRY_DELAY_MS, undefined, { signal }).catch(() => {});
    }
  }
}

/**
 * Start the Slack connector as a standalone webhook server.
 *
 * Starts a Bun HTTP server on the given port to handle Slack webhook events,
 * bridging them to Aria Runtime via tRPC.
 */
export async function startSlackConnector(
  options: number | StartSlackConnectorOptions = {},
): Promise<ConnectorRuntimeHandle> {
  const resolved =
    typeof options === "number" ? { mode: "webhook" as const, port: options } : options;
  const mode = resolved.mode ?? "webhook";
  const port = resolved.port ?? SLACK_DEFAULT_PORT;
  const registerSignalHandlers = resolved.registerSignalHandlers ?? true;

  if (mode === "socket") {
    return startSlackSocketConnector({ registerSignalHandlers });
  }

  const { chat, webhookHandler } = createSlackConnector();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === SLACK_WEBHOOK_PATH && request.method === "POST") {
        return webhookHandler(request);
      }
      return new Response("Esperta Aria Slack Connector", { status: 200 });
    },
  });

  console.log(`Slack connector listening on http://localhost:${server.port}${SLACK_WEBHOOK_PATH}`);

  let cleanupSignals = () => {};
  const stop = async () => {
    cleanupSignals();
    await chat.shutdown();
    server.stop();
  };

  if (registerSignalHandlers) {
    cleanupSignals = installConnectorSignalHandlers("Slack", stop);
  }

  return {
    name: "slack",
    stop,
  };
}

export async function startSlackSocketConnector(
  options: {
    registerSignalHandlers?: boolean;
  } = {},
): Promise<ConnectorRuntimeHandle> {
  if (!hasSlackSocketModeCredentials()) {
    const missing = getMissingSocketModeCredentials();
    throw new Error(
      `Slack Socket Mode requires: ${missing.join(", ")}. ` +
        "Store them via `aria config` or use the set_env_secret tool.",
    );
  }

  const { chat, webhookHandler } = createSlackConnector();
  const controller = new AbortController();
  const runPromise = runSlackSocketMode(webhookHandler, controller.signal).catch((error) => {
    if (!controller.signal.aborted) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Slack Socket Mode stopped unexpectedly: ${message}`);
    }
  });
  const registerSignalHandlers = options.registerSignalHandlers ?? true;

  console.log("Slack connector listening via Socket Mode");

  let cleanupSignals = () => {};
  const stop = async () => {
    cleanupSignals();
    controller.abort();
    await chat.shutdown();
    await runPromise.catch(() => {});
  };

  if (registerSignalHandlers) {
    cleanupSignals = installConnectorSignalHandlers("Slack", stop);
  }

  return {
    name: "slack",
    stop,
  };
}

export {
  getMissingCredentials,
  getMissingSocketModeCredentials,
  hasSlackCredentials,
  hasSlackSocketModeCredentials,
} from "./config.js";
