import { startServer, type EngineServer, type EngineServerOptions } from "@aria/gateway/server";
import { startConfiguredConnectors, type ServerConnectorRuntime } from "./connectors.js";
import { createRuntime, type EngineRuntime } from "./runtime.js";
import { CLI_NAME, PRODUCT_NAME, RUNTIME_NAME, getRuntimeHome } from "./brand.js";
import { getRuntimeDiscoveryPaths, type RuntimeDiscoveryPaths } from "./discovery.js";

export interface AriaServerFactories {
  createRuntime?: () => Promise<EngineRuntime>;
  startServer?: (runtime: EngineRuntime, options?: EngineServerOptions) => Promise<EngineServer>;
  startConnectors?: () => Promise<ServerConnectorRuntime>;
}

export interface StartAriaServerOptions extends EngineServerOptions {
  factories?: AriaServerFactories;
}

export interface AriaServerApp {
  runtime: EngineRuntime;
  server: EngineServer;
  stop(): Promise<void>;
}

export const ariaServerApp = {
  id: "aria-server",
  displayName: PRODUCT_NAME,
  runtimeName: RUNTIME_NAME,
  cliName: CLI_NAME,
  surface: "server",
  sharedPackages: ["@aria/runtime", "@aria/gateway"],
  capabilities: [
    "aria-agent-host",
    "gateway-api",
    "project-control",
    "remote-job-orchestration",
    "memory",
    "automation",
    "connectors",
    "approvals",
    "audit",
  ],
  ownership: {
    ariaAgent: "server-only",
    assistantState: "server-only",
    memory: "server-only",
    automation: "server-only",
    connectors: "server-only",
    inboxApprovals: "server-only",
    remoteJobs: "server-only",
    projectLocalExecution: "desktop-only",
  },
} as const;

export interface AriaServerBootstrap {
  app: typeof ariaServerApp;
  runtimeHome: string;
  discovery: RuntimeDiscoveryPaths;
  hostname?: string;
  port?: number;
}

export interface CreateAriaServerBootstrapOptions extends Pick<
  EngineServerOptions,
  "hostname" | "port"
> {
  runtimeHome?: string;
}

export function createAriaServerBootstrap(
  options: CreateAriaServerBootstrapOptions = {},
): AriaServerBootstrap {
  const runtimeHome = options.runtimeHome ?? getRuntimeHome();
  return {
    app: ariaServerApp,
    runtimeHome,
    discovery: getRuntimeDiscoveryPaths(runtimeHome),
    hostname: options.hostname,
    port: options.port,
  };
}

export async function startAriaServer(
  options: StartAriaServerOptions = {},
): Promise<AriaServerApp> {
  const { factories, ...serverOptions } = options;
  const createRuntimeImpl = factories?.createRuntime ?? createRuntime;
  const startServerImpl = factories?.startServer ?? startServer;
  const startConnectorsImpl = factories?.startConnectors ?? startConfiguredConnectors;
  const runtime = await createRuntimeImpl();
  let server: EngineServer | null = null;

  try {
    server = await startServerImpl(runtime, serverOptions);
    const activeServer = server;
    const connectors = await startConnectorsImpl();
    return {
      runtime,
      server: activeServer,
      async stop(): Promise<void> {
        await connectors.stop();
        await activeServer.stop();
      },
    };
  } catch (error) {
    if (server) {
      await server.stop();
    } else {
      await runtime.close();
    }
    throw error;
  }
}
