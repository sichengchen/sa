#!/usr/bin/env bun

import { writeFileSync, unlinkSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { createRuntime } from "./runtime.js";
import { startServer } from "./server.js";

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

  // Chat SDK connectors (Telegram, Discord, Slack, etc.) run as separate
  // webhook servers. Start them via `sa telegram`, `sa discord`, etc.

  // Graceful shutdown (with optional restart)
  const RESTART_MARKER = join(saHome, "engine.restart");

  function shutdown() {
    console.log("\nSA Engine shutting down...");
    const shouldRestart = existsSync(RESTART_MARKER);
    if (shouldRestart) {
      try { unlinkSync(RESTART_MARKER); } catch {}
    }
    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(URL_FILE); } catch {}
    // Force-exit after 5s if server.stop() hangs
    const forceTimer = setTimeout(() => process.exit(1), 5000);
    server.stop().then(
      () => {
        clearTimeout(forceTimer);
        if (shouldRestart) {
          const logFd = openSync(join(saHome, "engine.log"), "a");
          const child = spawn(process.execPath, [process.argv[1]!, "__engine"], {
            detached: true,
            stdio: ["ignore", logFd, logFd],
            env: { ...process.env },
          });
          child.unref();
          console.log(`SA Engine restarting (new PID: ${child.pid})...`);
        }
        process.exit(0);
      },
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
