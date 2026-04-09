import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { createAppRouter, flushProcedureState, type AppRouter } from "./procedures.js";
import { createContext } from "./context.js";
import type { EngineRuntime } from "./runtime.js";
import { heartbeatState } from "./scheduler.js";
import { frameAsData } from "./agent/content-frame.js";
import { logAutomationResult, runAutomationAgent, upsertWebhookTaskRecord } from "./automation.js";
import { RUNTIME_NAME, getRuntimeHome } from "@aria/shared/brand.js";

const DEFAULT_PORT = 7420;

interface WebhookBody {
  message: string;
  sessionId?: string;
}

/**
 * Authenticate a webhook request using the dedicated webhook bearer token.
 * Returns a Response if authentication fails, or null if authenticated.
 */
function authenticateWebhook(
  req: Request,
  runtime: EngineRuntime,
): Response | null {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearerToken || !runtime.auth.validateWebhookToken(bearerToken)) {
    try {
      runtime.audit.log({
        session: "webhook",
        connector: "webhook",
        event: "auth_failure",
        summary: "Webhook authentication failed",
      });
    } catch { /* non-fatal */ }
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null; // Authenticated
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
  const authError = authenticateWebhook(req, runtime);
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
  const authError = authenticateWebhook(req, runtime);
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

  const result = await runAutomationAgent(runtime, {
    taskId: task.id ?? `webhook:${task.slug}`,
    taskType: "webhook",
    sessionPrefix: `webhook:${slug}`,
    connectorType: "webhook",
    name: task.name,
    prompt,
    model: task.model,
    allowedTools: task.allowedTools,
    allowedToolsets: task.allowedToolsets,
    skills: task.skills,
    retryPolicy: task.retryPolicy,
    delivery: task.delivery,
  });

  await logAutomationResult(runtime, `webhook-${slug}`, prompt, result.responseText, result.toolCalls);

  console.log(`[webhook] Task "${task.name}" (${slug}) completed: ${result.summary}`);

  // Persist run metadata
  const refreshedConfig = runtime.config.getConfigFile();
  const webhookTasks = refreshedConfig.runtime.automation?.webhookTasks ?? [];
  const lastRunAt = new Date().toISOString();
  const updatedWebhookTasks = webhookTasks.map((item) => item.slug === slug ? {
    ...item,
    lastRunAt,
    lastStatus: result.status,
    lastSummary: result.summary,
  } : item);
  await runtime.config.saveConfig({
    ...refreshedConfig,
    runtime: {
      ...refreshedConfig.runtime,
      automation: {
        cronTasks: refreshedConfig.runtime.automation?.cronTasks ?? [],
        webhookTasks: updatedWebhookTasks,
      },
    },
  });
  const updatedTask = updatedWebhookTasks.find((item) => item.slug === slug);
  if (updatedTask) {
    upsertWebhookTaskRecord(runtime, updatedTask);
  }

  return new Response(
    JSON.stringify({
      slug,
      task: task.name,
      response: result.responseText,
      sessionId: result.sessionId,
      attempt: result.attemptNumber,
      maxAttempts: result.maxAttempts,
      deliveryStatus: result.deliveryStatus,
      deliveryError: result.deliveryError ?? null,
    }),
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

  const authError = authenticateWebhook(req, runtime);
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
  const runtimeHome = getRuntimeHome();

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
  await writeFile(join(runtimeHome, "engine.url"), httpUrl);

  console.log(`${RUNTIME_NAME} listening on ${httpUrl}`);
  console.log(`${RUNTIME_NAME} WS on ws://${hostname}:${port + 1}`);

  return {
    port,
    async stop() {
      await flushProcedureState(runtime);
      httpServer.stop(true);
      wssHandler.broadcastReconnectNotification();
      wss.close();
      // Clean up discovery files
      try { await unlink(join(runtimeHome, "engine.url")); } catch {}
      await runtime.close();
    },
  };
}
