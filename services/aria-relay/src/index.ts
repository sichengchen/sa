import { RelayService, RelayStore } from "@aria/relay";

export const ariaRelayService = {
  id: "aria-relay",
  displayName: "Aria Relay",
  surface: "relay",
  sharedPackages: ["@aria/relay", "@aria/protocol"],
  capabilities: ["transport", "access-broker", "attachment-resume"],
} as const;

export interface AriaRelayServiceBootstrap {
  service: typeof ariaRelayService;
  store: RelayStore;
  relay: RelayService;
}

export function createAriaRelayServiceBootstrap(statePath: string): AriaRelayServiceBootstrap {
  const store = new RelayStore(statePath);
  return {
    service: ariaRelayService,
    store,
    relay: new RelayService(store),
  };
}
