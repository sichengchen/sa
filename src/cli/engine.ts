import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { CLI_NAME, HOME_ENV_VAR, RUNTIME_NAME, getRuntimeHome } from "@aria/shared/brand.js";

const runtimeHome = getRuntimeHome();
const PID_FILE = join(runtimeHome, "engine.pid");
const URL_FILE = join(runtimeHome, "engine.url");
const LOG_FILE = join(runtimeHome, "engine.log");

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(): Promise<number | null> {
  if (!existsSync(PID_FILE)) return null;
  const raw = await readFile(PID_FILE, "utf-8");
  const pid = parseInt(raw.trim(), 10);
  if (isNaN(pid)) return null;
  return pid;
}

async function cleanStaleFiles(): Promise<void> {
  if (existsSync(PID_FILE)) await unlink(PID_FILE);
  if (existsSync(URL_FILE)) await unlink(URL_FILE);
}

async function start(): Promise<void> {
  const existingPid = await readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`${RUNTIME_NAME} is already running (PID ${existingPid}).`);
    return;
  }

  // Clean up stale files from a previous crashed run
  await cleanStaleFiles();

  const logFd = openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [process.argv[1], "__engine"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, [HOME_ENV_VAR]: runtimeHome },
  });

  child.unref();

  if (!child.pid) {
    console.error(`Failed to start ${RUNTIME_NAME}.`);
    process.exit(1);
  }

  // Wait for the engine to write its own PID file
  await new Promise((r) => setTimeout(r, 1500));

  if (!isProcessAlive(child.pid)) {
    console.error(`${RUNTIME_NAME} failed to start. Check logs: ${CLI_NAME} engine logs`);
    await cleanStaleFiles();
    process.exit(1);
  }

  console.log(`${RUNTIME_NAME} started (PID ${child.pid}).`);

  if (existsSync(URL_FILE)) {
    const url = await readFile(URL_FILE, "utf-8");
    console.log(`Listening on ${url.trim()}`);
  }
}

async function stop(): Promise<void> {
  const pid = await readPid();
  if (!pid || !isProcessAlive(pid)) {
    console.log(`${RUNTIME_NAME} is not running.`);
    await cleanStaleFiles();
    return;
  }

  process.kill(pid, "SIGTERM");

  // Wait up to 5 seconds for graceful shutdown
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (!isProcessAlive(pid)) break;
  }

  if (isProcessAlive(pid)) {
    process.kill(pid, "SIGKILL");
  }

  await cleanStaleFiles();
  console.log(`${RUNTIME_NAME} stopped.`);
}

async function status(): Promise<void> {
  const pid = await readPid();

  if (!pid || !isProcessAlive(pid)) {
    console.log(`${RUNTIME_NAME}: stopped`);
    if (pid) await cleanStaleFiles();
    return;
  }

  console.log(`${RUNTIME_NAME}: running (PID ${pid})`);

  if (existsSync(URL_FILE)) {
    const url = (await readFile(URL_FILE, "utf-8")).trim();
    console.log(`URL: ${url}`);

    // Try to hit health endpoint
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Status: ${(data as { status: string }).status}`);
      }
    } catch {
      console.log("Status: unreachable (may still be starting)");
    }
  }
}

async function logs(): Promise<void> {
  if (!existsSync(LOG_FILE)) {
    console.log("No log file found.");
    return;
  }
  const content = await readFile(LOG_FILE, "utf-8");
  // Show last 50 lines
  const lines = content.split("\n");
  const tail = lines.slice(-50).join("\n");
  console.log(tail);
}

async function restart(): Promise<void> {
  await stop();
  await start();
}

/** Ensure the Engine daemon is running. Starts it if not. */
export async function ensureEngine(): Promise<void> {
  const existingPid = await readPid();
  if (existingPid && isProcessAlive(existingPid)) return;
  await start();
}

export async function engineCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action || action === "--help" || action === "-h") {
    console.log(`${RUNTIME_NAME} — daemon management\n`);
    console.log(`Usage: ${CLI_NAME} engine <action>\n`);
    console.log("Actions:");
    console.log("  start     Start the runtime as a background daemon");
    console.log("  stop      Stop the running runtime");
    console.log("  status    Show runtime status");
    console.log("  logs      Show recent runtime logs");
    console.log("  restart   Restart the runtime");
    return;
  }

  const actions: Record<string, () => Promise<void>> = {
    start,
    stop,
    status,
    logs,
    restart,
  };

  const handler = actions[action];
  if (!handler) {
    console.error(`Unknown engine action: ${action}`);
    process.exit(1);
  }

  await handler();
}
