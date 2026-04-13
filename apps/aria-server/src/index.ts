import {
  CLI_NAME,
  ENGINE_PORT_ENV_VAR,
  HOME_ENV_VAR,
  PRODUCT_NAME,
  RUNTIME_NAME,
  ariaServerApp,
  getRuntimeDiscoveryPaths,
  startAriaServer,
  type AriaServerApp,
  type RuntimeDiscoveryPaths,
  type StartAriaServerOptions,
} from "@aria/server";
import { existsSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

export * from "@aria/server";

export const ARIA_SERVER_DAEMON_COMMAND = "__server_host";

export const ariaServerHost = {
  id: "aria-server",
  packageName: "aria-server",
  displayName: PRODUCT_NAME,
  surface: "server",
  shellPackage: "@aria/server",
  sharedPackages: ["@aria/server", "@aria/runtime", "@aria/gateway"],
  capabilities: ariaServerApp.capabilities,
  ownership: ariaServerApp.ownership,
  command: CLI_NAME,
} as const;

export interface AriaServerHostBootstrap {
  host: typeof ariaServerHost;
  discoveryPaths: RuntimeDiscoveryPaths;
  start(options?: StartAriaServerOptions): Promise<AriaServerApp>;
}

export function createAriaServerHostBootstrap(runtimeHome?: string): AriaServerHostBootstrap {
  return {
    host: ariaServerHost,
    discoveryPaths: getRuntimeDiscoveryPaths(runtimeHome),
    start(options) {
      return startAriaServer(options);
    },
  };
}

export interface AriaServerDaemonHostBootstrap extends AriaServerHostBootstrap {
  hiddenCommand: typeof ARIA_SERVER_DAEMON_COMMAND;
}

export function createAriaServerDaemonHostBootstrap(
  runtimeHome?: string,
): AriaServerDaemonHostBootstrap {
  return {
    ...createAriaServerHostBootstrap(runtimeHome),
    hiddenCommand: ARIA_SERVER_DAEMON_COMMAND,
  };
}

export interface RunAriaServerHostOptions extends StartAriaServerOptions {
  runtimeHome?: string;
}

export function runAriaServerHost(options: RunAriaServerHostOptions = {}): Promise<AriaServerApp> {
  const { runtimeHome, ...serverOptions } = options;
  return createAriaServerHostBootstrap(runtimeHome).start(serverOptions);
}

export async function runAriaServerDaemonHost(
  options: RunAriaServerHostOptions = {},
): Promise<void> {
  const { runtimeHome } = options;
  const bootstrap = createAriaServerDaemonHostBootstrap(runtimeHome);
  const { pidFile, urlFile, logFile, restartMarkerFile } = bootstrap.discoveryPaths;
  const port = process.env[ENGINE_PORT_ENV_VAR]
    ? parseInt(process.env[ENGINE_PORT_ENV_VAR]!, 10)
    : undefined;

  console.log(`${RUNTIME_NAME} bootstrapping...`);
  const app = await bootstrap.start({ ...options, port });

  const httpUrl = `http://127.0.0.1:${app.server.port}`;
  writeFileSync(pidFile, String(process.pid));
  writeFileSync(urlFile, httpUrl);

  function shutdown() {
    console.log(`\n${RUNTIME_NAME} shutting down...`);
    const shouldRestart = existsSync(restartMarkerFile);
    if (shouldRestart) {
      try {
        unlinkSync(restartMarkerFile);
      } catch {}
    }
    try {
      unlinkSync(pidFile);
    } catch {}
    try {
      unlinkSync(urlFile);
    } catch {}

    const forceTimer = setTimeout(() => process.exit(1), 5000);
    app.stop().then(
      () => {
        clearTimeout(forceTimer);
        if (shouldRestart) {
          const logFd = openSync(logFile, "a");
          const child = spawn(process.execPath, [process.argv[1]!, ARIA_SERVER_DAEMON_COMMAND], {
            detached: true,
            stdio: ["ignore", logFd, logFd],
            env: {
              ...process.env,
              [HOME_ENV_VAR]: bootstrap.discoveryPaths.runtimeHome,
            },
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
