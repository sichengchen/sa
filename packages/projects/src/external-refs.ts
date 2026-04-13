import type { ProjectsEngineRepository } from "./repository.js";
import type { ExternalRefRecord, ProjectsExternalSystem } from "./types.js";

export interface LegacyLinearThreadRefInput {
  projectId: string;
  threadId: string;
  linearIssueId: string;
  linearIdentifier?: string | null;
  linearSessionId?: string | null;
  metadataJson?: string | null;
  createdAt: number;
  updatedAt: number;
}

export function buildExternalRefId(
  ownerType: ExternalRefRecord["ownerType"],
  ownerId: string,
  system: ProjectsExternalSystem,
  externalId: string,
): string {
  return `${ownerType}:${ownerId}:${system}:${externalId}`;
}

export function createExternalRefRecord(input: {
  ownerType: ExternalRefRecord["ownerType"];
  ownerId: string;
  system: ProjectsExternalSystem;
  externalId: string;
  externalKey?: string | null;
  sessionId?: string | null;
  metadataJson?: string | null;
  createdAt: number;
  updatedAt: number;
}): ExternalRefRecord {
  return {
    externalRefId: buildExternalRefId(
      input.ownerType,
      input.ownerId,
      input.system,
      input.externalId,
    ),
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    system: input.system,
    externalId: input.externalId,
    externalKey: input.externalKey ?? null,
    sessionId: input.sessionId ?? null,
    metadataJson: input.metadataJson ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createLegacyLinearThreadExternalRefs(
  input: LegacyLinearThreadRefInput,
): ExternalRefRecord[] {
  const refs: ExternalRefRecord[] = [
    createExternalRefRecord({
      ownerType: "thread",
      ownerId: input.threadId,
      system: "linear",
      externalId: input.linearIssueId,
      externalKey: input.linearIdentifier ?? null,
      sessionId: input.linearSessionId ?? null,
      metadataJson: input.metadataJson ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }),
  ];

  if (input.linearIdentifier) {
    refs.push(
      createExternalRefRecord({
        ownerType: "thread",
        ownerId: input.threadId,
        system: "linear",
        externalId: input.linearIdentifier,
        externalKey: input.linearIssueId,
        sessionId: input.linearSessionId ?? null,
        metadataJson: input.metadataJson ?? null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      }),
    );
  }

  return refs;
}

export function findThreadRefsByLinearIssueId(
  repository: ProjectsEngineRepository,
  linearIssueId: string,
): ExternalRefRecord[] {
  return repository.findExternalRefsByExternal("linear", linearIssueId);
}
