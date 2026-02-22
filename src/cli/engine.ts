import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn, spawnSync } from "node:child_process";

const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");
const PID_FILE = join(saHome, "engine.pid");
const URL_FILE = join(saHome, "engine.url");
const LOG_FILE = join(saHome, "engine.log");

const BREW_SERVICE_LABEL = "homebrew.mxcl.sa";

type DaemonManager = "brew-services" | "manual";

/** Detect whether the engine is managed by brew services (launchd) or manually */
function detectDaemonManager(): DaemonManager {
  if (process.platform !== "darwin") return "manual";
  try {
    const result = spawnSync("launchctl", ["list", BREW_SERVICE_LABEL], {
      stdio: "pipe",
      timeout: 3000,
    });
    if (result.status === 0) return "brew-services";
  } catch {}
  return "manual";
}

/** Run a brew services command and return success/failure */
function runBrewServices(action: "start" | "stop" | "restart"): boolean {
  try {
    const result = spawnSync("brew", ["services", action, "sa"], {
      stdio: "inherit",
      timeout: 30_000,
    });
    return result.status === 0;
  } catch {
    console.error(
      "Could not run 'brew services'. Is Homebrew on your PATH?"
    );
    return false;
  }
}

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
  const manager = detectDaemonManager();

  if (manager === "brew-services") {
    console.log("SA Engine is managed by Homebrew services.");
    console.log("Delegating to: brew services start sa");
    if (!runBrewServices("start")) {
      console.error("brew services start failed.");
      process.exit(1);
    }
    return;
  }

  const existingPid = await readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`SA Engine is already running (PID ${existingPid}).`);
    return;
  }

  // Clean up stale files from a previous crashed run
  await cleanStaleFiles();

  const logFd = openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [process.argv[1], "__engine"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, SA_HOME: saHome },
  });

  child.unref();

  if (!child.pid) {
    console.error("Failed to start SA Engine.");
    process.exit(1);
  }

  // Wait for the engine to write its own PID file
  await new Promise((r) => setTimeout(r, 1500));

  if (!isProcessAlive(child.pid)) {
    console.error("SA Engine failed to start. Check logs: sa engine logs");
    await cleanStaleFiles();
    process.exit(1);
  }

  console.log(`SA Engine started (PID ${child.pid}).`);

  if (existsSync(URL_FILE)) {
    const url = await readFile(URL_FILE, "utf-8");
    console.log(`Listening on ${url.trim()}`);
  }
}

async function stop(): Promise<void> {
  const manager = detectDaemonManager();

  if (manager === "brew-services") {
    console.log("SA Engine is managed by Homebrew services.");
    console.log("Delegating to: brew services stop sa");
    if (!runBrewServices("stop")) {
      console.error("brew services stop failed.");
      process.exit(1);
    }
    await cleanStaleFiles();
    return;
  }

  const pid = await readPid();
  if (!pid || !isProcessAlive(pid)) {
    console.log("SA Engine is not running.");
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
  console.log("SA Engine stopped.");
}

async function status(): Promise<void> {
  const manager = detectDaemonManager();
  const managerLabel =
    manager === "brew-services"
      ? "Homebrew services (launchd)"
      : "manual (PID file)";
  const pid = await readPid();

  if (!pid || !isProcessAlive(pid)) {
    console.log("SA Engine: stopped");
    console.log(`Manager: ${managerLabel}`);
    if (manager === "brew-services") {
      console.log("Hint: run 'brew services start sa' to start");
    }
    if (pid) await cleanStaleFiles();
    return;
  }

  console.log(`SA Engine: running (PID ${pid})`);
  console.log(`Manager: ${managerLabel}`);

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
  const manager = detectDaemonManager();

  if (manager === "brew-services") {
    console.log("SA Engine is managed by Homebrew services.");
    console.log("View logs with: brew services log sa");
    console.log("");
  }

  if (!existsSync(LOG_FILE)) {
    if (manager !== "brew-services") console.log("No log file found.");
    return;
  }
  const content = await readFile(LOG_FILE, "utf-8");
  // Show last 50 lines
  const lines = content.split("\n");
  const tail = lines.slice(-50).join("\n");
  if (manager === "brew-services") {
    console.log("--- Local log file ---");
  }
  console.log(tail);
}

async function restart(): Promise<void> {
  const manager = detectDaemonManager();

  if (manager === "brew-services") {
    console.log("SA Engine is managed by Homebrew services.");
    console.log("Delegating to: brew services restart sa");
    if (!runBrewServices("restart")) {
      console.error("brew services restart failed.");
      process.exit(1);
    }
    return;
  }

  await stop();
  await start();
}

/** Ensure the Engine daemon is running. Starts it if not. */
export async function ensureEngine(): Promise<void> {
  // Fast path — engine is already running, no subprocess needed
  const existingPid = await readPid();
  if (existingPid && isProcessAlive(existingPid)) return;

  const manager = detectDaemonManager();

  if (manager === "brew-services") {
    console.log("Starting SA Engine via Homebrew services...");
    if (!runBrewServices("start")) {
      console.error("Failed to start SA Engine via brew services.");
      console.error("Try: brew services start sa");
      process.exit(1);
    }
    // Wait for engine to come up (it writes engine.pid on startup)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pid = await readPid();
      if (pid && isProcessAlive(pid)) return;
    }
    console.error("SA Engine did not start within 15 seconds.");
    console.error("Check logs: brew services log sa");
    process.exit(1);
  }

  await start();
}

export async function engineCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action || action === "--help" || action === "-h") {
    const manager = detectDaemonManager();
    console.log("SA Engine — daemon management\n");
    console.log("Usage: sa engine <action>\n");
    console.log("Actions:");
    console.log("  start     Start the Engine as a background daemon");
    console.log("  stop      Stop the running Engine");
    console.log("  status    Show Engine status");
    console.log("  logs      Show recent Engine logs");
    console.log("  restart   Restart the Engine");
    console.log("");
    console.log(
      `Manager: ${manager === "brew-services" ? "Homebrew services (launchd)" : "manual (PID file)"}`
    );
    if (manager === "brew-services") {
      console.log("Commands will delegate to 'brew services' automatically.");
    }
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
