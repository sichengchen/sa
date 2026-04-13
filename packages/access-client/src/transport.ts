import { createEngineClient, type ClientOptions } from "./client.js";
import {
  selectRelayRoute,
  type RelayTransportMode,
  type RelayTransportPreference,
} from "@aria/relay";

export type {
  EngineEvent,
  Session,
  SkillInfo,
  ToolApprovalRequest,
} from "@aria/protocol";

export type { ClientOptions } from "./client.js";

export interface AccessClientTarget {
  serverId: string;
  baseUrl: string;
  token?: string;
  directBaseUrl?: string;
  relayBaseUrl?: string;
  directReachable?: boolean;
  preferredTransportMode?: RelayTransportPreference;
}

export interface AccessClientConfig extends ClientOptions {
  serverId: string;
}

export interface AccessClientRoute extends AccessClientConfig {
  baseUrl: string;
  transportMode: RelayTransportMode;
  usesRelay: boolean;
}

export interface AccessClientHandle {
  serverId: string;
  client: ReturnType<typeof createEngineClient>;
}

export interface AccessClientTargetSummary {
  serverId: string;
  label: string;
  httpUrl: string;
  wsUrl: string;
  isSelected: boolean;
  selectionLabel: string;
}

export interface AccessClientTargetRoster {
  selectedServerId: string | null;
  targets: AccessClientTargetSummary[];
  selectedTarget: AccessClientTargetSummary | null;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function resolveAccessClientRoute(
  target: AccessClientTarget,
): AccessClientRoute {
  const route = selectRelayRoute({
    serverId: target.serverId,
    directBaseUrl: target.directBaseUrl ?? target.baseUrl,
    relayBaseUrl: target.relayBaseUrl,
    directReachable: target.directReachable,
    preferredTransportMode: target.preferredTransportMode,
  });
  const httpUrl = new URL(route.baseUrl);
  httpUrl.search = "";
  httpUrl.hash = "";
  const wsUrl = new URL(httpUrl.toString());
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

  return {
    serverId: target.serverId,
    baseUrl: stripTrailingSlash(httpUrl.toString()),
    httpUrl: stripTrailingSlash(httpUrl.toString()),
    wsUrl: stripTrailingSlash(wsUrl.toString()),
    token: target.token,
    transportMode: route.transportMode,
    usesRelay: route.usesRelay,
  };
}

export function buildAccessClientConfig(
  target: AccessClientTarget,
): AccessClientConfig {
  const route = resolveAccessClientRoute(target);
  return {
    serverId: route.serverId,
    httpUrl: route.httpUrl,
    wsUrl: route.wsUrl,
    token: route.token,
  };
}

function resolveSelectedServerId(
  targets: ReadonlyArray<AccessClientTarget>,
  selectedServerId?: string | null,
): string | null {
  if (
    selectedServerId &&
    targets.some((target) => target.serverId === selectedServerId)
  ) {
    return selectedServerId;
  }

  return targets[0]?.serverId ?? null;
}

export function buildAccessClientTargetSummary(
  target: AccessClientTarget,
  selectedServerId?: string | null,
): AccessClientTargetSummary {
  const config = buildAccessClientConfig(target);
  const resolvedSelectedServerId = selectedServerId ?? target.serverId;
  const isSelected = resolvedSelectedServerId === target.serverId;

  return {
    serverId: config.serverId,
    label: config.serverId,
    httpUrl: config.httpUrl,
    wsUrl: config.wsUrl,
    isSelected,
    selectionLabel: isSelected ? "Selected" : "Available",
  };
}

export function buildAccessClientTargetSummaries(
  targets: ReadonlyArray<AccessClientTarget>,
  selectedServerId?: string | null,
): AccessClientTargetSummary[] {
  const resolvedSelectedServerId = resolveSelectedServerId(
    targets,
    selectedServerId,
  );

  return targets.map((target) =>
    buildAccessClientTargetSummary(target, resolvedSelectedServerId),
  );
}

export function buildAccessClientTargetRoster(
  targets: ReadonlyArray<AccessClientTarget>,
  selectedServerId?: string | null,
): AccessClientTargetRoster {
  const resolvedSelectedServerId = resolveSelectedServerId(
    targets,
    selectedServerId,
  );
  const summaries = buildAccessClientTargetSummaries(
    targets,
    resolvedSelectedServerId,
  );

  return {
    selectedServerId: resolvedSelectedServerId,
    targets: summaries,
    selectedTarget: summaries.find((summary) => summary.isSelected) ?? null,
  };
}

export function createAccessClient(
  target: AccessClientTarget,
): AccessClientHandle {
  const { serverId, ...clientOptions } = buildAccessClientConfig(target);
  return {
    serverId,
    client: createEngineClient(clientOptions),
  };
}
