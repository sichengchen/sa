#!/usr/bin/env bun

import { writeFileSync, unlinkSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createRuntime } from "./runtime.js";
import { startServer } from "./server.js";
import { ENGINE_PORT_ENV_VAR, HOME_ENV_VAR, RUNTIME_NAME, getRuntimeHome } from "@aria/shared/brand.js";

const runtimeHome = getRuntimeHome();
const PID_FILE = join(runtimeHome, "engine.pid");
const URL_FILE = join(runtimeHome, "engine.url");

const port = process.env[ENGINE_PORT_ENV_VAR]
  ? parseInt(process.env[ENGINE_PORT_ENV_VAR]!, 10)
  : undefined;

async function main() {
  console.log(`${RUNTIME_NAME} bootstrapping...`);
  const runtime = await createRuntime();
  const server = await startServer(runtime, { port });

  // Write discovery files so `aria engine status` works regardless of how we were started
  const httpUrl = `http://127.0.0.1:${server.port}`;
  writeFileSync(PID_FILE, String(process.pid));
  writeFileSync(URL_FILE, httpUrl);

  // Chat SDK connectors (Telegram, Discord, Slack, etc.) run as separate
  // webhook servers. Start them via `aria telegram`, `aria discord`, etc.

  // Graceful shutdown (with optional restart)
  const RESTART_MARKER = join(runtimeHome, "engine.restart");

  function shutdown() {
    console.log(`\n${RUNTIME_NAME} shutting down...`);
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
          const logFd = openSync(join(runtimeHome, "engine.log"), "a");
          const child = spawn(process.execPath, [process.argv[1]!, "__engine"], {
            detached: true,
            stdio: ["ignore", logFd, logFd],
            env: { ...process.env, [HOME_ENV_VAR]: runtimeHome },
          });
          child.unref();
          console.log(`${RUNTIME_NAME} restarting (new PID: ${child.pid})...`);
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
  console.error(`${RUNTIME_NAME} failed to start:`, err);
  process.exit(1);
});
