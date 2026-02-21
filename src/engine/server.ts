import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { createAppRouter, type AppRouter } from "./procedures.js";
import { createContext } from "./context.js";
import type { EngineRuntime } from "./runtime.js";

const DEFAULT_PORT = 7420;

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
