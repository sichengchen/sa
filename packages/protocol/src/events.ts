import { createEventCorrelationIdentity } from "./identity.js";
import type { ConnectorType, EngineEvent, Session, ThreadType } from "./types.js";

export type EngineEventPayload = Omit<
  EngineEvent,
  "sessionId" | "timestamp" | "runId" | "parentRunId" | "connectorType" | "source" | "taskId"
>;

export type EngineEventStreamSession = Pick<Session, "id" | "connectorId" | "connectorType">;

export interface EngineEventEnvelopeMeta {
  sessionId: string;
  connectorType: ConnectorType;
  source: string;
  runId?: string;
  parentRunId?: string | null;
  taskId?: string;
  session?: EngineEventStreamSession;
  threadId?: string;
  threadType?: ThreadType;
  workspaceId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  environmentBindingId?: string | null;
  jobId?: string | null;
  agentId?: string | null;
  actorId?: string | null;
  serverId?: string | null;
  defaultAgentId?: string | null;
  timestamp?: number;
}

export function resolveEngineEventThreadType(meta: EngineEventEnvelopeMeta): ThreadType {
  if (meta.threadType) {
    return meta.threadType;
  }

  return meta.session?.connectorType === "engine" || meta.connectorType === "engine"
    ? "aria"
    : "connector";
}

export function createEngineEventEnvelope<T extends EngineEventPayload>(
  event: T,
  meta: EngineEventEnvelopeMeta,
): EngineEvent {
  const identity = createEventCorrelationIdentity({
    serverId: meta.serverId ?? undefined,
    workspaceId: meta.workspaceId ?? undefined,
    projectId: meta.projectId ?? undefined,
    environmentId: meta.environmentId ?? undefined,
    threadId: meta.threadId ?? meta.session?.id ?? meta.sessionId,
    sessionId: meta.sessionId,
    runId: meta.runId,
    jobId: meta.jobId ?? undefined,
    taskId: meta.taskId,
    agentId: meta.agentId ?? meta.defaultAgentId ?? undefined,
    actorId: meta.actorId ?? meta.session?.connectorId ?? undefined,
  });

  return {
    ...event,
    ...identity,
    connectorType: meta.connectorType,
    parentRunId: meta.parentRunId,
    source: meta.source,
    threadType: resolveEngineEventThreadType(meta),
    environmentBindingId: meta.environmentBindingId ?? undefined,
    timestamp: meta.timestamp ?? Date.now(),
  } as unknown as EngineEvent;
}
