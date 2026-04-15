import { readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnAriaServerDaemonHost } from "aria-server/process";
import { CLI_NAME, HOME_ENV_VAR, RUNTIME_NAME } from "@aria/server/brand";
import { getRuntimeDiscoveryPaths, type RuntimeDiscoveryPaths } from "./discovery.js";

export interface EngineDaemonChildProcess {
  pid?: number | null;
}

export interface EngineDaemonDependencies {
  existsSync(path: string): boolean;
  readFile(path: string, encoding: "utf-8"): Promise<string>;
  unlink(path: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  spawnDaemonHost(options: {
    runtimeHome: string;
    logFile: string;
    env?: NodeJS.ProcessEnv;
  }): EngineDaemonChildProcess;
  isProcessAlive(pid: number): boolean;
  kill(pid: number, signal?: NodeJS.Signals | 0): void;
  fetch(url: string): Promise<{ ok: boolean; json(): Promise<unknown> }>;
  log(message: string): void;
  error(message: string): void;
  exit(code: number): never | void;
}

export interface EngineDaemonController {
  startEngine(): Promise<void>;
  stopEngine(): Promise<void>;
  statusEngine(): Promise<void>;
  logsEngine(): Promise<void>;
  restartEngine(): Promise<void>;
  ensureEngine(): Promise<void>;
  engineCommand(args: string[]): Promise<void>;
}

export interface CreateEngineDaemonControllerOptions {
  discoveryPaths?: RuntimeDiscoveryPaths;
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<EngineDaemonDependencies>;
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createDefaultDependencies(): EngineDaemonDependencies {
  return {
    existsSync,
    readFile,
    unlink,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    spawnDaemonHost: spawnAriaServerDaemonHost,
    isProcessAlive: defaultIsProcessAlive,
    kill: (pid, signal) => process.kill(pid, signal),
    fetch: (url) =>
      globalThis.fetch(url) as Promise<{
        ok: boolean;
        json(): Promise<unknown>;
      }>,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    exit: (code) => process.exit(code),
  };
}

export function createEngineDaemonController(
  options: CreateEngineDaemonControllerOptions = {},
): EngineDaemonController {
  const discoveryPaths = options.discoveryPaths ?? getRuntimeDiscoveryPaths();
  const env = options.env ?? process.env;
  const deps = {
    ...createDefaultDependencies(),
    ...options.dependencies,
  } satisfies EngineDaemonDependencies;

  const { runtimeHome, pidFile, urlFile, logFile } = discoveryPaths;

  async function readPid(): Promise<number | null> {
    if (!deps.existsSync(pidFile)) return null;
    const raw = await deps.readFile(pidFile, "utf-8");
    const pid = parseInt(raw.trim(), 10);
    if (Number.isNaN(pid)) return null;
    return pid;
  }

  async function cleanStaleFiles(): Promise<void> {
    if (deps.existsSync(pidFile)) await deps.unlink(pidFile);
    if (deps.existsSync(urlFile)) await deps.unlink(urlFile);
  }

  async function startEngine(): Promise<void> {
    const existingPid = await readPid();
    if (existingPid && deps.isProcessAlive(existingPid)) {
      deps.log(`${RUNTIME_NAME} is already running (PID ${existingPid}).`);
      return;
    }

    await cleanStaleFiles();

    const child = deps.spawnDaemonHost({
      runtimeHome,
      logFile,
      env: { ...env, [HOME_ENV_VAR]: runtimeHome },
    });

    if (!child.pid) {
      deps.error(`Failed to start ${RUNTIME_NAME}.`);
      deps.exit(1);
      return;
    }

    await deps.sleep(1500);

    if (!deps.isProcessAlive(child.pid)) {
      deps.error(`${RUNTIME_NAME} failed to start. Check logs: ${CLI_NAME} engine logs`);
      await cleanStaleFiles();
      deps.exit(1);
      return;
    }

    deps.log(`${RUNTIME_NAME} started (PID ${child.pid}).`);

    if (deps.existsSync(urlFile)) {
      const url = await deps.readFile(urlFile, "utf-8");
      deps.log(`Listening on ${url.trim()}`);
    }
  }

  async function stopEngine(): Promise<void> {
    const pid = await readPid();
    if (!pid || !deps.isProcessAlive(pid)) {
      deps.log(`${RUNTIME_NAME} is not running.`);
      await cleanStaleFiles();
      return;
    }

    deps.kill(pid, "SIGTERM");

    for (let index = 0; index < 50; index += 1) {
      await deps.sleep(100);
      if (!deps.isProcessAlive(pid)) break;
    }

    if (deps.isProcessAlive(pid)) {
      deps.kill(pid, "SIGKILL");
    }

    await cleanStaleFiles();
    deps.log(`${RUNTIME_NAME} stopped.`);
  }

  async function statusEngine(): Promise<void> {
    const pid = await readPid();

    if (!pid || !deps.isProcessAlive(pid)) {
      deps.log(`${RUNTIME_NAME}: stopped`);
      if (pid) await cleanStaleFiles();
      return;
    }

    deps.log(`${RUNTIME_NAME}: running (PID ${pid})`);

    if (deps.existsSync(urlFile)) {
      const url = (await deps.readFile(urlFile, "utf-8")).trim();
      deps.log(`URL: ${url}`);

      try {
        const response = await deps.fetch(`${url}/health`);
        if (response.ok) {
          const data = (await response.json()) as { status: string };
          deps.log(`Status: ${data.status}`);
        }
      } catch {
        deps.log("Status: unreachable (may still be starting)");
      }
    }
  }

  async function logsEngine(): Promise<void> {
    if (!deps.existsSync(logFile)) {
      deps.log("No log file found.");
      return;
    }
    const content = await deps.readFile(logFile, "utf-8");
    const lines = content.split("\n");
    deps.log(lines.slice(-50).join("\n"));
  }

  async function restartEngine(): Promise<void> {
    await stopEngine();
    await startEngine();
  }

  async function ensureEngine(): Promise<void> {
    const existingPid = await readPid();
    if (existingPid && deps.isProcessAlive(existingPid)) {
      return;
    }
    await startEngine();
  }

  async function engineCommand(args: string[]): Promise<void> {
    const action = args[0];

    if (!action || action === "--help" || action === "-h") {
      deps.log(`${RUNTIME_NAME} — daemon management\n`);
      deps.log(`Usage: ${CLI_NAME} engine <action>\n`);
      deps.log("Actions:");
      deps.log("  start     Start the runtime as a background daemon");
      deps.log("  stop      Stop the running runtime");
      deps.log("  status    Show runtime status");
      deps.log("  logs      Show recent runtime logs");
      deps.log("  restart   Restart the runtime");
      return;
    }

    const actions: Record<string, () => Promise<void>> = {
      start: startEngine,
      stop: stopEngine,
      status: statusEngine,
      logs: logsEngine,
      restart: restartEngine,
    };

    const handler = actions[action];
    if (!handler) {
      deps.error(`Unknown engine action: ${action}`);
      deps.exit(1);
      return;
    }

    await handler();
  }

  return {
    startEngine,
    stopEngine,
    statusEngine,
    logsEngine,
    restartEngine,
    ensureEngine,
    engineCommand,
  };
}

const engineDaemonController = createEngineDaemonController();

export const startEngine = engineDaemonController.startEngine;
export const stopEngine = engineDaemonController.stopEngine;
export const statusEngine = engineDaemonController.statusEngine;
export const logsEngine = engineDaemonController.logsEngine;
export const restartEngine = engineDaemonController.restartEngine;
export const ensureEngine = engineDaemonController.ensureEngine;
export const engineCommand = engineDaemonController.engineCommand;
