import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME_ENV_VAR } from "@aria/server/brand";

export const ARIA_SERVER_DAEMON_COMMAND = "__server_host";

const ARIA_SERVER_MAIN_SOURCE_ENTRY = fileURLToPath(new URL("./main.ts", import.meta.url));
const ARIA_SERVER_MAIN_ENTRY_ENV_VAR = "ARIA_SERVER_MAIN_ENTRY";

export interface AriaServerDaemonProcessSpec {
  executable: string;
  args: string[];
  mode: "app_entry" | "cli_hidden_command";
}

export interface ResolveAriaServerDaemonProcessSpecOptions {
  execPath?: string;
  cliEntrypoint?: string;
  appEntrypoint?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SpawnAriaServerDaemonHostOptions extends ResolveAriaServerDaemonProcessSpecOptions {
  runtimeHome: string;
  logFile: string;
  env?: NodeJS.ProcessEnv;
}

function isBunExecutable(executable: string): boolean {
  const name = basename(executable).toLowerCase();
  return name === "bun" || name === "bun.exe";
}

function isElectronExecutable(executable: string): boolean {
  return (
    Boolean(process.versions.electron) || basename(executable).toLowerCase().includes("electron")
  );
}

function resolveBunExecutable(env: NodeJS.ProcessEnv): string {
  const candidates = [env.BUN_EXECUTABLE, env.npm_execpath];
  for (const candidate of candidates) {
    if (candidate && isBunExecutable(candidate)) {
      return candidate;
    }
  }

  if (env.BUN_INSTALL) {
    const installedBun = join(
      env.BUN_INSTALL,
      "bin",
      process.platform === "win32" ? "bun.exe" : "bun",
    );
    if (existsSync(installedBun)) {
      return installedBun;
    }
  }

  return process.platform === "win32" ? "bun.exe" : "bun";
}

function resolveScriptExecutable(
  executable: string,
  scriptPath: string,
  env: NodeJS.ProcessEnv,
): string {
  if (isBunExecutable(executable)) {
    return executable;
  }

  // Electron's executable launches another app instance; the server host needs a script runtime.
  if (
    isElectronExecutable(executable) ||
    scriptPath.endsWith(".ts") ||
    scriptPath.endsWith(".tsx")
  ) {
    return resolveBunExecutable(env);
  }

  return executable;
}

function resolveDefaultAriaServerMainEntry(env: NodeJS.ProcessEnv): string | null {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    env[ARIA_SERVER_MAIN_ENTRY_ENV_VAR],
    ARIA_SERVER_MAIN_SOURCE_ENTRY,
    join(moduleDir, "..", "..", "..", "aria-server", "src", "main.ts"),
    env.INIT_CWD ? join(env.INIT_CWD, "apps/aria-server/src/main.ts") : undefined,
    join(process.cwd(), "apps/aria-server/src/main.ts"),
    join(process.cwd(), "../aria-server/src/main.ts"),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveAriaServerDaemonProcessSpec(
  options: ResolveAriaServerDaemonProcessSpecOptions = {},
): AriaServerDaemonProcessSpec {
  const executable = options.execPath ?? process.execPath;
  const env = options.env ?? process.env;
  const appEntrypoint = options.appEntrypoint ?? resolveDefaultAriaServerMainEntry(env);

  if (appEntrypoint && existsSync(appEntrypoint)) {
    return {
      executable: resolveScriptExecutable(executable, appEntrypoint, env),
      args: [appEntrypoint],
      mode: "app_entry",
    };
  }

  const cliEntrypoint = options.cliEntrypoint ?? process.argv[1];
  if (!cliEntrypoint) {
    throw new Error("Unable to resolve an Aria daemon entrypoint");
  }

  return {
    executable: resolveScriptExecutable(executable, cliEntrypoint, env),
    args: [cliEntrypoint, ARIA_SERVER_DAEMON_COMMAND],
    mode: "cli_hidden_command",
  };
}

export function spawnAriaServerDaemonHost(options: SpawnAriaServerDaemonHostOptions): ChildProcess {
  mkdirSync(options.runtimeHome, { recursive: true });
  const logFd = openSync(options.logFile, "a");
  const processSpec = resolveAriaServerDaemonProcessSpec(options);
  const child = spawn(processSpec.executable, processSpec.args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...(options.env ?? process.env),
      [HOME_ENV_VAR]: options.runtimeHome,
    },
  });

  child.unref();
  return child;
}
