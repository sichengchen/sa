#!/usr/bin/env bun

import { existsSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { HOME_ENV_VAR, ENGINE_PORT_ENV_VAR, RUNTIME_NAME } from "@aria/server/brand";
import { getRuntimeDiscoveryPaths } from "./discovery.js";
import { startAriaServer } from "./app.js";

const {
  runtimeHome,
  pidFile: PID_FILE,
  urlFile: URL_FILE,
  logFile: LOG_FILE,
  restartMarkerFile: RESTART_MARKER,
} = getRuntimeDiscoveryPaths();

const port = process.env[ENGINE_PORT_ENV_VAR]
  ? parseInt(process.env[ENGINE_PORT_ENV_VAR]!, 10)
  : undefined;

export async function runAriaServerProcess(): Promise<void> {
  console.log(`${RUNTIME_NAME} bootstrapping...`);
  const app = await startAriaServer({ port });

  // Write discovery files so `aria engine status` works regardless of how we were started.
  const httpUrl = `http://127.0.0.1:${app.server.port}`;
  writeFileSync(PID_FILE, String(process.pid));
  writeFileSync(URL_FILE, httpUrl);

  // Graceful shutdown (with optional restart).
  function shutdown() {
    console.log(`\n${RUNTIME_NAME} shutting down...`);
    const shouldRestart = existsSync(RESTART_MARKER);
    if (shouldRestart) {
      try { unlinkSync(RESTART_MARKER); } catch {}
    }
    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(URL_FILE); } catch {}
    const forceTimer = setTimeout(() => process.exit(1), 5000);
    app.stop().then(
      () => {
        clearTimeout(forceTimer);
        if (shouldRestart) {
          const logFd = openSync(LOG_FILE, "a");
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
      () => {
        clearTimeout(forceTimer);
        process.exit(1);
      },
    );
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

runAriaServerProcess().catch((err) => {
  console.error(`${RUNTIME_NAME} failed to start:`, err);
  process.exit(1);
});
