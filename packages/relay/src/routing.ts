import type { RelayTransportMode } from "./types.js";

export type RelayTransportPreference = RelayTransportMode | "auto";

export interface RelayRouteTarget {
  serverId: string;
  directBaseUrl?: string | null;
  relayBaseUrl?: string | null;
  directReachable?: boolean | null;
  preferredTransportMode?: RelayTransportPreference;
}

export interface RelayRouteSelection {
  serverId: string;
  baseUrl: string;
  transportMode: RelayTransportMode;
  usesRelay: boolean;
  reason:
    | "preferred-direct"
    | "preferred-relay-assisted"
    | "preferred-relay-tunnel"
    | "direct-first"
    | "direct-unreachable-relay-assisted"
    | "relay-only";
}

function normalizeBaseUrl(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireRouteBaseUrl(
  value: string | undefined,
  transportMode: RelayTransportMode,
  serverId: string,
): string {
  if (value) {
    return value;
  }

  throw new Error(`Relay route ${transportMode} is unavailable for server ${serverId}`);
}

export function selectRelayRoute(target: RelayRouteTarget): RelayRouteSelection {
  const directBaseUrl = normalizeBaseUrl(target.directBaseUrl);
  const relayBaseUrl = normalizeBaseUrl(target.relayBaseUrl);
  const preferredTransportMode = target.preferredTransportMode ?? "auto";
  const directReachable = target.directReachable ?? true;

  if (preferredTransportMode === "direct") {
    return {
      serverId: target.serverId,
      baseUrl: requireRouteBaseUrl(directBaseUrl, "direct", target.serverId),
      transportMode: "direct",
      usesRelay: false,
      reason: "preferred-direct",
    };
  }

  if (preferredTransportMode === "relay_assisted") {
    return {
      serverId: target.serverId,
      baseUrl: requireRouteBaseUrl(directBaseUrl, "relay_assisted", target.serverId),
      transportMode: "relay_assisted",
      usesRelay: true,
      reason: "preferred-relay-assisted",
    };
  }

  if (preferredTransportMode === "relay_tunnel") {
    return {
      serverId: target.serverId,
      baseUrl: requireRouteBaseUrl(relayBaseUrl, "relay_tunnel", target.serverId),
      transportMode: "relay_tunnel",
      usesRelay: true,
      reason: "preferred-relay-tunnel",
    };
  }

  if (directBaseUrl && directReachable) {
    return {
      serverId: target.serverId,
      baseUrl: directBaseUrl,
      transportMode: "direct",
      usesRelay: false,
      reason: "direct-first",
    };
  }

  if (directBaseUrl && relayBaseUrl) {
    return {
      serverId: target.serverId,
      baseUrl: directBaseUrl,
      transportMode: "relay_assisted",
      usesRelay: true,
      reason: "direct-unreachable-relay-assisted",
    };
  }

  if (relayBaseUrl) {
    return {
      serverId: target.serverId,
      baseUrl: relayBaseUrl,
      transportMode: "relay_tunnel",
      usesRelay: true,
      reason: "relay-only",
    };
  }

  if (directBaseUrl) {
    return {
      serverId: target.serverId,
      baseUrl: directBaseUrl,
      transportMode: "direct",
      usesRelay: false,
      reason: "direct-first",
    };
  }

  throw new Error(`No direct or relay route is configured for server ${target.serverId}`);
}
