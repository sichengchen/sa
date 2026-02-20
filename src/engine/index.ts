#!/usr/bin/env bun

import { createRuntime } from "./runtime.js";
import { startServer } from "./server.js";

const port = process.env.SA_ENGINE_PORT
  ? parseInt(process.env.SA_ENGINE_PORT, 10)
  : undefined;

async function main() {
  console.log("SA Engine bootstrapping...");
  const runtime = await createRuntime();
  const server = await startServer(runtime, { port });

  // Graceful shutdown
  function shutdown() {
    console.log("\nSA Engine shutting down...");
    server.stop().then(() => process.exit(0));
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("SA Engine failed to start:", err);
  process.exit(1);
});
