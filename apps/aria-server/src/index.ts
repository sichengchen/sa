import {
  CLI_NAME,
  PRODUCT_NAME,
  ariaServerApp,
  getRuntimeDiscoveryPaths,
  startAriaServer,
  type AriaServerApp,
  type RuntimeDiscoveryPaths,
  type StartAriaServerOptions,
} from "@aria/server";

export * from "@aria/server";

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
