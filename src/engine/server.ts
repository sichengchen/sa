import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { createAppRouter, type AppRouter } from "./procedures.js";
import { createContext } from "./context.js";
import type { EngineRuntime } from "./runtime.js";
import type { EngineEvent } from "../shared/types.js";

const DEFAULT_PORT = 7420;

interface WebhookBody {
  message: string;
  sessionId?: string;
  secret?: string;
}

/** Handle POST /webhook requests */
async function handleWebhook(req: Request, runtime: EngineRuntime, appRouter: ReturnType<typeof createAppRouter>): Promise<Response> {
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

  // Authenticate via shared secret
  if (webhookConfig.secret) {
    const provided = body.secret ?? req.headers.get("x-webhook-secret");
    if (provided !== webhookConfig.secret) {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // Create or resume session
  let sessionId = body.sessionId;
  if (!sessionId) {
    const session = runtime.sessions.createSession(`webhook-${Date.now()}`, "webhook");
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
    // SSE streaming response
    const caller = appRouter.createCaller(createContext());
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

  // Synchronous JSON response — collect all events
  const caller = appRouter.createCaller(createContext());
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

      // Webhook endpoint
      if (url.pathname === "/webhook" && req.method === "POST") {
        return handleWebhook(req, runtime, appRouter);
      }

      // tRPC handler
      if (url.pathname.startsWith("/trpc")) {
        return fetchRequestHandler({
          endpoint: "/trpc",
          req,
          router: appRouter,
          createContext,
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
    createContext() {
      return createContext();
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
