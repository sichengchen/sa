import { z } from "zod";

export const EventCorrelationIdentitySchema = z.object({
  serverId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  environmentId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
});

export type EventCorrelationIdentity = z.infer<
  typeof EventCorrelationIdentitySchema
>;

type EventCorrelationIdentityInput = {
  [K in keyof EventCorrelationIdentity]: string | null | undefined;
};

function normalizeId(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createEventCorrelationIdentity(
  input: EventCorrelationIdentityInput,
): EventCorrelationIdentity {
  const identity = Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, normalizeId(value)])
      .filter(([, value]) => value !== undefined),
  );

  return EventCorrelationIdentitySchema.parse(identity);
}

export function hasServerHostedEventIdentity(
  identity: EventCorrelationIdentity,
): identity is EventCorrelationIdentity & {
  serverId: string;
  threadId: string;
  sessionId: string;
  runId: string;
  agentId: string;
} {
  return Boolean(
    identity.serverId &&
    identity.threadId &&
    identity.sessionId &&
    identity.runId &&
    identity.agentId,
  );
}

export function hasRemoteProjectEventIdentity(
  identity: EventCorrelationIdentity,
): identity is EventCorrelationIdentity & {
  serverId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  threadId: string;
  jobId: string;
  runId: string;
  agentId: string;
} {
  return Boolean(
    identity.serverId &&
    identity.workspaceId &&
    identity.projectId &&
    identity.environmentId &&
    identity.threadId &&
    identity.jobId &&
    identity.runId &&
    identity.agentId,
  );
}

export function hasLocalProjectEventIdentity(
  identity: EventCorrelationIdentity,
): identity is EventCorrelationIdentity & {
  projectId: string;
  environmentId: string;
  threadId: string;
  runId: string;
  agentId: string;
} {
  return Boolean(
    identity.projectId &&
    identity.environmentId &&
    identity.threadId &&
    identity.runId &&
    identity.agentId,
  );
}
