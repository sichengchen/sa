import { createEngineClient, type ClientOptions } from "./client.js";

export type { EngineEvent, Session, SkillInfo, ToolApprovalRequest } from "@aria/protocol";

export type { ClientOptions } from "./client.js";

export type AccessPathPreference = "primary" | "secondary" | "auto";
export type AccessRouteMode = "primary" | "secondary";

export interface AccessClientTarget {
  serverId: string;
  baseUrl: string;
  token?: string;
  primaryBaseUrl?: string;
  secondaryBaseUrl?: string;
  primaryReachable?: boolean;
  preferredAccessMode?: AccessPathPreference;
}

export interface AccessClientConfig extends ClientOptions {
  serverId: string;
}

export interface AccessClientRoute extends AccessClientConfig {
  baseUrl: string;
  accessMode: AccessRouteMode;
  usesSecondary: boolean;
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

export interface HostAccessClientTargetDefaults {
  serverId: string;
  baseUrl: string;
}

interface AccessRouteTarget {
  serverId: string;
  primaryBaseUrl?: string | null;
  secondaryBaseUrl?: string | null;
  primaryReachable?: boolean | null;
  preferredAccessMode?: AccessPathPreference;
}

function normalizeBaseUrl(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function requireBaseUrl(
  value: string | undefined,
  serverId: string,
  mode: AccessRouteMode,
): string {
  if (value) {
    return value;
  }
  throw new Error(`No ${mode} access URL is configured for server ${serverId}`);
}

function selectAccessRoute(target: AccessRouteTarget): {
  serverId: string;
  baseUrl: string;
  accessMode: AccessRouteMode;
  usesSecondary: boolean;
} {
  const primaryBaseUrl = normalizeBaseUrl(target.primaryBaseUrl);
  const secondaryBaseUrl = normalizeBaseUrl(target.secondaryBaseUrl);
  const preferredAccessMode = target.preferredAccessMode ?? "auto";
  const primaryReachable = target.primaryReachable ?? true;

  if (preferredAccessMode === "primary") {
    return {
      serverId: target.serverId,
      baseUrl: requireBaseUrl(primaryBaseUrl, target.serverId, "primary"),
      accessMode: "primary",
      usesSecondary: false,
    };
  }

  if (preferredAccessMode === "secondary") {
    return {
      serverId: target.serverId,
      baseUrl: requireBaseUrl(secondaryBaseUrl, target.serverId, "secondary"),
      accessMode: "secondary",
      usesSecondary: true,
    };
  }

  if (primaryBaseUrl && primaryReachable) {
    return {
      serverId: target.serverId,
      baseUrl: primaryBaseUrl,
      accessMode: "primary",
      usesSecondary: false,
    };
  }

  if (secondaryBaseUrl) {
    return {
      serverId: target.serverId,
      baseUrl: secondaryBaseUrl,
      accessMode: "secondary",
      usesSecondary: true,
    };
  }

  if (primaryBaseUrl) {
    return {
      serverId: target.serverId,
      baseUrl: primaryBaseUrl,
      accessMode: "primary",
      usesSecondary: false,
    };
  }

  throw new Error(`No gateway access URL is configured for server ${target.serverId}`);
}

export function resolveHostAccessClientTarget(
  config: Partial<AccessClientTarget> | undefined,
  defaults: HostAccessClientTargetDefaults,
): AccessClientTarget {
  return {
    serverId: config?.serverId ?? defaults.serverId,
    baseUrl: config?.baseUrl ?? defaults.baseUrl,
    token: config?.token,
    primaryBaseUrl: config?.primaryBaseUrl,
    secondaryBaseUrl: config?.secondaryBaseUrl,
    primaryReachable: config?.primaryReachable,
    preferredAccessMode: config?.preferredAccessMode,
  };
}

export function resolveAccessClientRoute(target: AccessClientTarget): AccessClientRoute {
  const route = selectAccessRoute({
    serverId: target.serverId,
    primaryBaseUrl: target.primaryBaseUrl ?? target.baseUrl,
    secondaryBaseUrl: target.secondaryBaseUrl,
    primaryReachable: target.primaryReachable,
    preferredAccessMode: target.preferredAccessMode,
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
    accessMode: route.accessMode,
    usesSecondary: route.usesSecondary,
  };
}

export function buildAccessClientConfig(target: AccessClientTarget): AccessClientConfig {
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
  if (selectedServerId && targets.some((target) => target.serverId === selectedServerId)) {
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
  const resolvedSelectedServerId = resolveSelectedServerId(targets, selectedServerId);

  return targets.map((target) => buildAccessClientTargetSummary(target, resolvedSelectedServerId));
}

export function buildAccessClientTargetRoster(
  targets: ReadonlyArray<AccessClientTarget>,
  selectedServerId?: string | null,
): AccessClientTargetRoster {
  const resolvedSelectedServerId = resolveSelectedServerId(targets, selectedServerId);
  const summaries = buildAccessClientTargetSummaries(targets, resolvedSelectedServerId);

  return {
    selectedServerId: resolvedSelectedServerId,
    targets: summaries,
    selectedTarget: summaries.find((summary) => summary.isSelected) ?? null,
  };
}

export function createAccessClient(target: AccessClientTarget): AccessClientHandle {
  const { serverId, ...clientOptions } = buildAccessClientConfig(target);
  return {
    serverId,
    client: createEngineClient(clientOptions),
  };
}
