import { createEngineClient, type ClientOptions } from "./client.js";

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
}

export interface AccessClientConfig extends ClientOptions {
  serverId: string;
}

export interface AccessClientHandle {
  serverId: string;
  client: ReturnType<typeof createEngineClient>;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function buildAccessClientConfig(target: AccessClientTarget): AccessClientConfig {
  const httpUrl = new URL(target.baseUrl);
  httpUrl.search = "";
  httpUrl.hash = "";
  const wsUrl = new URL(httpUrl.toString());
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

  return {
    serverId: target.serverId,
    httpUrl: stripTrailingSlash(httpUrl.toString()),
    wsUrl: stripTrailingSlash(wsUrl.toString()),
    token: target.token,
  };
}

export function createAccessClient(target: AccessClientTarget): AccessClientHandle {
  const { serverId, ...clientOptions } = buildAccessClientConfig(target);
  return {
    serverId,
    client: createEngineClient(clientOptions),
  };
}
