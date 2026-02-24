import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { timingSafeEqual } from "node:crypto";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { createAppRouter, type AppRouter } from "./procedures.js";
import { createContext } from "./context.js";
import type { EngineRuntime } from "./runtime.js";
import type { EngineEvent } from "@sa/shared/types.js";
import { heartbeatState } from "./scheduler.js";
import { Agent } from "./agent/index.js";
import { frameAsData } from "./agent/content-frame.js";

/** Timing-safe string comparison to prevent timing attacks on secret comparison */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const DEFAULT_PORT = 7420;

interface WebhookBody {
  message: string;
  sessionId?: string;
}

/**
 * Authenticate a webhook request using bearer token.
 * Returns a Response if authentication fails, or null if authenticated.
 */
function authenticateWebhook(
  req: Request,
  webhookConfig: { token?: string } | undefined,
): Response | null {
  if (webhookConfig?.token) {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearerToken || !safeCompare(bearerToken, webhookConfig.token)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return null; // Authenticated
  }

  return null; // No auth configured = open
}

/** Handle POST /webhook/agent requests (direct agent chat) */
async function handleWebhookAgent(req: Request, runtime: EngineRuntime, appRouter: ReturnType<typeof createAppRouter>): Promise<Response> {
  const configFile = runtime.config.getConfigFile();
  const webhookConfig = configFile.runtime.webhook;

  if (!webhookConfig?.enabled) {
    return new Response(JSON.stringify({ error: "Webhook connector is disabled" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  let body: WebhookBody;
  try {
    body = await req.json() as WebhookBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!body.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'message' field" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Authenticate (bearer token only)
  const authError = authenticateWebhook(req, webhookConfig);
  if (authError) return authError;

  // Create or resume session
  let sessionId = body.sessionId;
  if (!sessionId) {
    const session = runtime.sessions.create("webhook", "webhook");
    sessionId = session.id;
  } else {
    const existing = runtime.sessions.getSession(sessionId);
    if (!existing) {
      return new Response(JSON.stringify({ error: `Session not found: ${sessionId}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    runtime.sessions.touchSession(sessionId);
  }

  // Check if SSE streaming is requested
  const acceptSSE = req.headers.get("accept")?.includes("text/event-stream");

  if (acceptSSE) {
    // SSE streaming response — use master token for internal calls
    const caller = appRouter.createCaller(createContext({ rawToken: runtime.auth.getMasterToken() }));
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const gen = await caller.chat.stream({ sessionId: sessionId!, message: body.message });
          for await (const event of gen) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            if (event.type === "done" || event.type === "error") break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  // Synchronous JSON response — use master token for internal calls
  const caller = appRouter.createCaller(createContext({ rawToken: runtime.auth.getMasterToken() }));
  let responseText = "";
  const toolCalls: { name: string; content: string; isError: boolean }[] = [];

  try {
    const gen = await caller.chat.stream({ sessionId, message: body.message });
    for await (const event of gen) {
      switch (event.type) {
        case "text_delta":
          responseText += event.delta;
          break;
        case "tool_end":
          toolCalls.push({ name: event.name, content: event.content, isError: event.isError });
          break;
        case "done":
        case "error":
          break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ sessionId, response: responseText, toolCalls }),
    { headers: { "content-type": "application/json" } },
  );
}

/** Handle POST /webhook/tasks/:slug — routed webhook automation tasks */
async function handleWebhookTask(req: Request, slug: string, runtime: EngineRuntime): Promise<Response> {
  const configFile = runtime.config.getConfigFile();
  const webhookConfig = configFile.runtime.webhook;

  if (!webhookConfig?.enabled) {
    return new Response(JSON.stringify({ error: "Webhook connector is disabled" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  // Authenticate
  const authError = authenticateWebhook(req, webhookConfig);
  if (authError) return authError;

  // Look up task by slug
  const tasks = configFile.runtime.automation?.webhookTasks ?? [];
  const task = tasks.find((t) => t.slug === slug);
  if (!task) {
    return new Response(JSON.stringify({ error: `Webhook task not found: ${slug}` }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  if (!task.enabled) {
    return new Response(JSON.stringify({ error: `Webhook task is disabled: ${slug}` }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  // Parse request body
  let payloadStr = "{}";
  try {
    const rawBody = await req.json();
    payloadStr = JSON.stringify(rawBody);
  } catch {
    // No body or invalid JSON — use empty payload
  }

  // Truncate very large payloads
  if (payloadStr.length > 10000) {
    payloadStr = payloadStr.slice(0, 10000) + "...(truncated)";
  }

  // Frame webhook payload using the standard content framing system
  const securePayload = frameAsData(payloadStr, "webhook");
  const prompt = task.prompt.replace(/\{\{payload\}\}/g, securePayload);

  // Dispatch to isolated agent session
  const session = runtime.sessions.create(`webhook:${slug}`, "webhook");
  const agent = runtime.createAgent();
  let responseText = "";

  try {
    for await (const event of agent.chat(prompt)) {
      if (event.type === "text_delta") responseText += event.delta;
    }
  } catch (err) {
    responseText = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Log result
  const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");
  const logDir = join(saHome, "automation");
  try {
    await mkdir(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(
      join(logDir, `webhook-${slug}-${timestamp}.log`),
      `Task: ${task.name}\nSlug: ${slug}\nPrompt: ${prompt}\n---\n${responseText}`,
    );
  } catch {
    // Logging failure is non-fatal
  }

  // Deliver to connector if configured
  if (task.connector) {
    const notifyTool = runtime.tools.find((t) => t.name === "notify");
    if (notifyTool) {
      try {
        await notifyTool.execute({ message: responseText, connector: task.connector });
      } catch {
        // Notification failure is non-fatal
      }
    }
  }

  console.log(`[webhook] Task "${task.name}" (${slug}) completed: ${responseText.slice(0, 100)}`);

  return new Response(
    JSON.stringify({ slug, task: task.name, response: responseText, sessionId: session.id }),
    { headers: { "content-type": "application/json" } },
  );
}

/** Handle POST /webhook/heartbeat — trigger heartbeat immediately */
async function handleWebhookHeartbeat(req: Request, runtime: EngineRuntime): Promise<Response> {
  const configFile = runtime.config.getConfigFile();
  const webhookConfig = configFile.runtime.webhook;

  // Authenticate (heartbeat webhook requires webhook to be enabled)
  if (!webhookConfig?.enabled) {
    return new Response(JSON.stringify({ error: "Webhook connector is disabled" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const authError = authenticateWebhook(req, webhookConfig);
  if (authError) return authError;

  // Check if heartbeat is enabled
  if (heartbeatState.config && !heartbeatState.config.enabled) {
    return new Response(JSON.stringify({ error: "Heartbeat is disabled" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    });
  }

  // Trigger only the heartbeat task (not all cron jobs)
  try {
    await runtime.scheduler.runTask("heartbeat");
    return new Response(
      JSON.stringify({ triggered: true, lastResult: heartbeatState.lastResult }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export interface EngineServerOptions {
  port?: number;
  hostname?: string;
}

export interface EngineServer {
  port: number;
  stop: () => Promise<void>;
}

/** Start the Engine's HTTP + WebSocket server */
export async function startServer(runtime: EngineRuntime, options: EngineServerOptions = {}): Promise<EngineServer> {
  const port = options.port ?? DEFAULT_PORT;
  const hostname = options.hostname ?? "127.0.0.1";
  const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");

  const appRouter = createAppRouter(runtime);

  // HTTP server via Bun.serve (fetch adapter)
  const httpServer = Bun.serve({
    port,
    hostname,
    fetch(req) {
      const url = new URL(req.url);

      // Health endpoint (non-tRPC, for simple curl checks)
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
        });
      }

      // Webhook endpoints (all under /webhook/*)
      if (url.pathname === "/webhook/agent" && req.method === "POST") {
        return handleWebhookAgent(req, runtime, appRouter);
      }
      // Legacy /webhook route (backwards compat → redirects to /webhook/agent)
      if (url.pathname === "/webhook" && req.method === "POST") {
        return handleWebhookAgent(req, runtime, appRouter);
      }
      if (url.pathname === "/webhook/heartbeat" && req.method === "POST") {
        return handleWebhookHeartbeat(req, runtime);
      }
      // /webhook/tasks/:slug
      const taskMatch = url.pathname.match(/^\/webhook\/tasks\/([a-zA-Z0-9_-]+)$/);
      if (taskMatch && req.method === "POST") {
        return handleWebhookTask(req, taskMatch[1]!, runtime);
      }

      // tRPC handler — pass request for Bearer token extraction
      if (url.pathname.startsWith("/trpc")) {
        return fetchRequestHandler({
          endpoint: "/trpc",
          req,
          router: appRouter,
          createContext: () => createContext({ req }),
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  // WebSocket server for tRPC subscriptions (separate port)
  const wss = new WebSocketServer({ port: port + 1, host: hostname });
  const wssHandler = applyWSSHandler<AppRouter>({
    wss,
    router: appRouter,
    createContext({ req }) {
      // Extract token from WS connection URL query string (?token=xxx)
      const wsUrl = new URL(req.url ?? "", `http://${req.headers.host}`);
      const rawToken = wsUrl.searchParams.get("token") ?? undefined;
      return createContext({ rawToken });
    },
  });

  const httpUrl = `http://${hostname}:${port}`;

  // Write discovery files for CLI and Connectors
  await writeFile(join(saHome, "engine.url"), httpUrl);

  console.log(`SA Engine listening on ${httpUrl}`);
  console.log(`SA Engine WS on ws://${hostname}:${port + 1}`);

  return {
    port,
    async stop() {
      httpServer.stop(true);
      wssHandler.broadcastReconnectNotification();
      wss.close();
      // Clean up discovery files
      try { await unlink(join(saHome, "engine.url")); } catch {}
      await runtime.auth.cleanup();
    },
  };
}
