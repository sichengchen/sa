import { startServer, type EngineServer, type EngineServerOptions } from "@aria/gateway/server";
import { createRuntime, type EngineRuntime } from "@aria/runtime";

export interface AriaServerFactories {
  createRuntime?: () => Promise<EngineRuntime>;
  startServer?: (runtime: EngineRuntime, options?: EngineServerOptions) => Promise<EngineServer>;
}

export interface StartAriaServerOptions extends EngineServerOptions {
  factories?: AriaServerFactories;
}

export interface AriaServerApp {
  runtime: EngineRuntime;
  server: EngineServer;
  stop(): Promise<void>;
}

export interface AriaServerBootstrap {
  app: typeof ariaServerApp;
  runtimeHome: string;
  discovery: RuntimeDiscoveryPaths;
  hostname?: string;
  port?: number;
}

export interface CreateAriaServerBootstrapOptions extends Pick<EngineServerOptions, "hostname" | "port"> {
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

export async function startAriaServer(options: StartAriaServerOptions = {}): Promise<AriaServerApp> {
  const { factories, ...serverOptions } = options;
  const createRuntimeImpl = factories?.createRuntime ?? createRuntime;
  const startServerImpl = factories?.startServer ?? startServer;
  const runtime = await createRuntimeImpl();

  try {
    const server = await startServerImpl(runtime, serverOptions);
    return {
      runtime,
      server,
      async stop(): Promise<void> {
        await server.stop();
      },
    };
  } catch (error) {
    await runtime.close();
    throw error;
  }
}
