import { homedir } from "node:os";
import { join } from "node:path";
import { RelayService, RelayStore } from "@aria/relay";

export const ariaRelayService = {
  id: "aria-relay",
  displayName: "Aria Relay",
  surface: "relay",
  sharedPackages: ["@aria/relay", "@aria/protocol"],
  planes: ["control", "data", "push"],
  capabilities: [
    "transport",
    "access-broker",
    "server-registration",
    "scoped-access-grants",
    "attachment-resume",
    "direct-or-relayed-routing",
  ],
} as const;

export interface AriaRelayServiceBootstrap {
  service: typeof ariaRelayService;
  store: RelayStore;
  relay: RelayService;
  statePath: string;
}

export function createAriaRelayServiceBootstrap(statePath: string): AriaRelayServiceBootstrap {
  const store = new RelayStore(statePath);
  return {
    service: ariaRelayService,
    store,
    relay: new RelayService(store),
    statePath,
  };
}

const RELAY_STATE_FILE = "relay-state.json";
const RELAY_HOME_DIR = ".aria";
const RELAY_HOME_ENV_VAR = "ARIA_HOME";

export function resolveAriaRelayStatePath(runtimeHome?: string): string {
  return join(
    runtimeHome ?? process.env[RELAY_HOME_ENV_VAR] ?? join(homedir(), RELAY_HOME_DIR),
    RELAY_STATE_FILE,
  );
}

export interface RunAriaRelayServiceOptions {
  statePath?: string;
  runtimeHome?: string;
}

export async function runAriaRelayServiceHost(
  options: RunAriaRelayServiceOptions = {},
): Promise<AriaRelayServiceBootstrap> {
  const statePath = options.statePath ?? resolveAriaRelayStatePath(options.runtimeHome);
  const bootstrap = createAriaRelayServiceBootstrap(statePath);
  await bootstrap.store.load();
  return bootstrap;
}
