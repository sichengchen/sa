import { randomUUID } from "node:crypto";
import { RelayStore } from "./store.js";
import type {
  RelayAccessGrantRecord,
  RelayAccessGrantRequest,
  RelayApprovalResponse,
  RelayAttachmentRequest,
  RelayDeviceRecord,
  RelayFollowUpMessage,
  RelayQueuedEventRecord,
  RelayServerRecord,
  RelaySessionAttachmentRecord,
} from "./types.js";

function isGrantActive(grant: RelayAccessGrantRecord, now = Date.now()): boolean {
  return !grant.revokedAt && grant.expiresAt > now;
}

type RelayState = Awaited<ReturnType<RelayStore["load"]>>;

export class RelayService {
  constructor(private readonly store: RelayStore) {}

  async registerServer(
    record: Omit<RelayServerRecord, "enrollmentToken"> & {
      enrollmentToken?: string | null;
    },
  ): Promise<RelayServerRecord> {
    const state = await this.store.load();
    const next: RelayServerRecord = {
      ...record,
      enrollmentToken: record.enrollmentToken ?? randomUUID(),
    };
    const existing = state.servers.findIndex((server) => server.serverId === record.serverId);
    if (existing >= 0) {
      state.servers[existing] = next;
    } else {
      state.servers.push(next);
    }
    await this.store.save(state);
    return next;
  }

  async revokeServer(serverId: string, revokedAt = Date.now()): Promise<RelayServerRecord> {
    const state = await this.store.load();
    const existing = state.servers.find((server) => server.serverId === serverId);
    if (!existing) {
      throw new Error(`Server not found: ${serverId}`);
    }
    const updated = { ...existing, revokedAt };
    state.servers = state.servers.map((server) =>
      server.serverId === serverId ? updated : server,
    );
    await this.store.save(state);
    return updated;
  }

  async listServers(): Promise<RelayServerRecord[]> {
    const state = await this.store.load();
    return [...state.servers].sort((a, b) => b.registeredAt - a.registeredAt);
  }

  async registerDevice(
    record: Omit<RelayDeviceRecord, "pairingToken"> & {
      pairingToken?: string | null;
    },
  ): Promise<RelayDeviceRecord> {
    const state = await this.store.load();
    const next: RelayDeviceRecord = {
      ...record,
      pairingToken: record.pairingToken ?? randomUUID(),
    };
    const existing = state.devices.findIndex((device) => device.deviceId === record.deviceId);
    if (existing >= 0) {
      state.devices[existing] = next;
    } else {
      state.devices.push(next);
    }
    await this.store.save(state);
    return next;
  }

  async revokeDevice(deviceId: string, revokedAt = Date.now()): Promise<RelayDeviceRecord> {
    const state = await this.store.load();
    const existing = state.devices.find((device) => device.deviceId === deviceId);
    if (!existing) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    const updated = { ...existing, revokedAt };
    state.devices = state.devices.map((device) =>
      device.deviceId === deviceId ? updated : device,
    );
    await this.store.save(state);
    return updated;
  }

  async listDevices(): Promise<RelayDeviceRecord[]> {
    const state = await this.store.load();
    return [...state.devices].sort((a, b) => b.pairedAt - a.pairedAt);
  }

  async issueAccessGrant(request: RelayAccessGrantRequest): Promise<RelayAccessGrantRecord> {
    const state = await this.store.load();
    const server = state.servers.find((entry) => entry.serverId === request.serverId);
    if (!server || server.revokedAt) {
      throw new Error(`Server not found or revoked: ${request.serverId}`);
    }
    const device = state.devices.find((entry) => entry.deviceId === request.deviceId);
    if (!device || device.revokedAt) {
      throw new Error(`Device not found or revoked: ${request.deviceId}`);
    }

    const issuedAt = request.issuedAt ?? Date.now();
    const expiresAt = request.expiresAt ?? issuedAt + 60 * 60 * 1000;
    const grant: RelayAccessGrantRecord = {
      grantId: randomUUID(),
      grantToken: randomUUID(),
      serverId: request.serverId,
      deviceId: request.deviceId,
      workspaceId: request.workspaceId ?? null,
      threadId: request.threadId ?? null,
      attachmentKind: request.attachmentKind ?? null,
      transportMode: request.transportMode ?? null,
      canSendMessages: request.canSendMessages ?? true,
      canRespondToApprovals: request.canRespondToApprovals ?? true,
      issuedAt,
      expiresAt,
      revokedAt: null,
      metadataJson: request.metadataJson ?? null,
    };
    state.accessGrants.push(grant);
    await this.store.save(state);
    return grant;
  }

  async revokeAccessGrant(
    grantId: string,
    revokedAt = Date.now(),
  ): Promise<RelayAccessGrantRecord> {
    const state = await this.store.load();
    const existing = state.accessGrants.find((grant) => grant.grantId === grantId);
    if (!existing) {
      throw new Error(`Access grant not found: ${grantId}`);
    }
    const updated = { ...existing, revokedAt };
    state.accessGrants = state.accessGrants.map((grant) =>
      grant.grantId === grantId ? updated : grant,
    );
    await this.store.save(state);
    return updated;
  }

  async listAccessGrants(
    filters: {
      serverId?: string;
      deviceId?: string;
      includeExpired?: boolean;
      includeRevoked?: boolean;
    } = {},
  ): Promise<RelayAccessGrantRecord[]> {
    const state = await this.store.load();
    const now = Date.now();
    return state.accessGrants
      .filter((grant) => !filters.serverId || grant.serverId === filters.serverId)
      .filter((grant) => !filters.deviceId || grant.deviceId === filters.deviceId)
      .filter((grant) => (filters.includeRevoked ? true : !grant.revokedAt))
      .filter((grant) => (filters.includeExpired ? true : grant.expiresAt > now))
      .sort((a, b) => b.issuedAt - a.issuedAt);
  }

  private async resolveAccessGrantToken(
    token?: string | null,
    scope?: {
      deviceId?: string;
      serverId?: string | null;
      workspaceId?: string | null;
      threadId?: string | null;
    },
  ): Promise<RelayAccessGrantRecord | undefined> {
    if (!token) {
      return undefined;
    }
    const state = await this.store.load();
    const grant = state.accessGrants.find((entry) => entry.grantToken === token);
    if (!grant || !isGrantActive(grant)) {
      return undefined;
    }
    if (scope?.deviceId && grant.deviceId !== scope.deviceId) {
      return undefined;
    }
    if (scope?.serverId && grant.serverId !== scope.serverId) {
      return undefined;
    }
    if (scope?.workspaceId && grant.workspaceId && grant.workspaceId !== scope.workspaceId) {
      return undefined;
    }
    if (scope?.threadId && grant.threadId && grant.threadId !== scope.threadId) {
      return undefined;
    }
    return grant;
  }

  async attachSession(
    request: RelayAttachmentRequest,
    options: {
      canSendMessages?: boolean;
      canRespondToApprovals?: boolean;
    } = {},
    attachedAt = Date.now(),
  ): Promise<RelaySessionAttachmentRecord> {
    const state = await this.store.load();
    const device = state.devices.find((entry) => entry.deviceId === request.deviceId);
    if (!device || device.revokedAt) {
      throw new Error(`Device not found or revoked: ${request.deviceId}`);
    }

    const accessGrant = await this.resolveAccessGrantToken(request.accessGrantToken, {
      deviceId: request.deviceId,
      serverId: request.serverId ?? null,
      workspaceId: request.workspaceId ?? null,
      threadId: request.threadId ?? null,
    });
    if (request.accessGrantToken && !accessGrant) {
      throw new Error(`Access grant is invalid or expired for device ${request.deviceId}`);
    }

    const existing = state.attachments.find(
      (attachment) =>
        attachment.deviceId === request.deviceId &&
        attachment.sessionId === request.sessionId &&
        !attachment.detachedAt,
    );

    const attachment: RelaySessionAttachmentRecord = existing
      ? {
          ...existing,
          serverId: request.serverId ?? accessGrant?.serverId ?? existing.serverId ?? null,
          workspaceId:
            request.workspaceId ?? accessGrant?.workspaceId ?? existing.workspaceId ?? null,
          projectId: request.projectId ?? existing.projectId ?? null,
          threadId: request.threadId ?? accessGrant?.threadId ?? existing.threadId ?? null,
          jobId: request.jobId ?? existing.jobId ?? null,
          accessGrantId: accessGrant?.grantId ?? existing.accessGrantId ?? null,
          attachmentKind:
            request.attachmentKind ??
            accessGrant?.attachmentKind ??
            existing.attachmentKind ??
            null,
          transportMode:
            request.transportMode ?? accessGrant?.transportMode ?? existing.transportMode ?? null,
          resumable: existing.resumable ?? true,
          canSendMessages:
            accessGrant?.canSendMessages ?? options.canSendMessages ?? existing.canSendMessages,
          canRespondToApprovals:
            accessGrant?.canRespondToApprovals ??
            options.canRespondToApprovals ??
            existing.canRespondToApprovals,
        }
      : {
          attachmentId: randomUUID(),
          deviceId: request.deviceId,
          sessionId: request.sessionId,
          serverId: request.serverId ?? accessGrant?.serverId ?? null,
          workspaceId: request.workspaceId ?? accessGrant?.workspaceId ?? null,
          projectId: request.projectId ?? null,
          threadId: request.threadId ?? accessGrant?.threadId ?? null,
          jobId: request.jobId ?? null,
          accessGrantId: accessGrant?.grantId ?? null,
          attachmentKind: request.attachmentKind ?? accessGrant?.attachmentKind ?? null,
          transportMode: request.transportMode ?? accessGrant?.transportMode ?? null,
          resumable: true,
          attachedAt,
          detachedAt: null,
          canSendMessages: accessGrant?.canSendMessages ?? options.canSendMessages ?? true,
          canRespondToApprovals:
            accessGrant?.canRespondToApprovals ?? options.canRespondToApprovals ?? true,
        };

    state.attachments = existing
      ? state.attachments.map((entry) =>
          entry.attachmentId === attachment.attachmentId ? attachment : entry,
        )
      : [...state.attachments, attachment];
    await this.store.save(state);
    return attachment;
  }

  async detachSession(
    deviceId: string,
    sessionId: string,
    detachedAt = Date.now(),
  ): Promise<RelaySessionAttachmentRecord | null> {
    const state = await this.store.load();
    const existing = state.attachments.find(
      (attachment) =>
        attachment.deviceId === deviceId &&
        attachment.sessionId === sessionId &&
        !attachment.detachedAt,
    );
    if (!existing) {
      return null;
    }

    const updated = { ...existing, detachedAt };
    state.attachments = state.attachments.map((attachment) =>
      attachment.attachmentId === updated.attachmentId ? updated : attachment,
    );
    await this.store.save(state);
    return updated;
  }

  async listAttachments(deviceId?: string): Promise<RelaySessionAttachmentRecord[]> {
    const state = await this.store.load();
    return state.attachments
      .filter((attachment) => !deviceId || attachment.deviceId === deviceId)
      .sort((a, b) => b.attachedAt - a.attachedAt);
  }

  async queueFollowUp(
    message: RelayFollowUpMessage,
    createdAt = Date.now(),
  ): Promise<RelayQueuedEventRecord> {
    if (
      !(await this.canAttach({
        deviceId: message.deviceId,
        sessionId: message.sessionId,
        accessGrantToken: message.accessGrantToken ?? null,
        serverId: message.serverId ?? null,
        threadId: message.threadId ?? null,
      }))
    ) {
      throw new Error(`Device ${message.deviceId} is not attached to session ${message.sessionId}`);
    }

    const state = await this.store.load();
    const attachment = state.attachments.find(
      (entry) =>
        entry.deviceId === message.deviceId &&
        entry.sessionId === message.sessionId &&
        !entry.detachedAt,
    );
    const grant = await this.resolveQueuedGrant(state, attachment, message.accessGrantToken, {
      deviceId: message.deviceId,
      serverId: message.serverId ?? null,
      threadId: message.threadId ?? null,
    });
    if (attachment?.accessGrantId && grant?.grantId !== attachment.accessGrantId) {
      throw new Error(
        `Access grant ${grant?.grantId ?? "missing"} does not match attachment grant ${attachment.accessGrantId}`,
      );
    }
    const event: RelayQueuedEventRecord = {
      eventId: randomUUID(),
      deviceId: message.deviceId,
      sessionId: message.sessionId,
      serverId: message.serverId ?? attachment?.serverId ?? grant?.serverId ?? null,
      threadId: message.threadId ?? attachment?.threadId ?? grant?.threadId ?? null,
      jobId: message.jobId ?? attachment?.jobId ?? null,
      accessGrantId: grant?.grantId ?? attachment?.accessGrantId ?? null,
      type: "follow_up",
      payloadJson: JSON.stringify({ message: message.message }),
      createdAt,
      deliveredAt: null,
    };
    state.events.push(event);
    await this.store.save(state);
    return event;
  }

  async queueApprovalResponse(
    response: RelayApprovalResponse,
    createdAt = Date.now(),
  ): Promise<RelayQueuedEventRecord> {
    if (!(await this.canRespondToApproval(response))) {
      throw new Error(
        `Device ${response.deviceId} cannot respond to approvals for session ${response.sessionId}`,
      );
    }

    const state = await this.store.load();
    const attachment = state.attachments.find(
      (entry) =>
        entry.deviceId === response.deviceId &&
        entry.sessionId === response.sessionId &&
        !entry.detachedAt,
    );
    const grant = await this.resolveQueuedGrant(state, attachment, response.accessGrantToken, {
      deviceId: response.deviceId,
      serverId: response.serverId ?? null,
      threadId: response.threadId ?? null,
    });
    if (attachment?.accessGrantId && grant?.grantId !== attachment.accessGrantId) {
      throw new Error(
        `Access grant ${grant?.grantId ?? "missing"} does not match attachment grant ${attachment.accessGrantId}`,
      );
    }
    const event: RelayQueuedEventRecord = {
      eventId: randomUUID(),
      deviceId: response.deviceId,
      sessionId: response.sessionId,
      serverId: response.serverId ?? attachment?.serverId ?? grant?.serverId ?? null,
      threadId: response.threadId ?? attachment?.threadId ?? grant?.threadId ?? null,
      jobId: response.jobId ?? attachment?.jobId ?? null,
      accessGrantId: grant?.grantId ?? attachment?.accessGrantId ?? null,
      type: "approval_response",
      payloadJson: JSON.stringify({
        toolCallId: response.toolCallId,
        approved: response.approved,
      }),
      createdAt,
      deliveredAt: null,
    };
    state.events.push(event);
    await this.store.save(state);
    return event;
  }

  async listEvents(deviceId?: string, includeDelivered = true): Promise<RelayQueuedEventRecord[]> {
    const state = await this.store.load();
    return state.events
      .filter((event) => !deviceId || event.deviceId === deviceId)
      .filter((event) => includeDelivered || !event.deliveredAt)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async markDelivered(eventId: string, deliveredAt = Date.now()): Promise<RelayQueuedEventRecord> {
    const state = await this.store.load();
    const existing = state.events.find((event) => event.eventId === eventId);
    if (!existing) {
      throw new Error(`Relay event not found: ${eventId}`);
    }
    const updated = { ...existing, deliveredAt };
    state.events = state.events.map((event) => (event.eventId === eventId ? updated : event));
    await this.store.save(state);
    return updated;
  }

  async canAttach(request: RelayAttachmentRequest): Promise<boolean> {
    const state = await this.store.load();
    const device = state.devices.find((entry) => entry.deviceId === request.deviceId);
    if (!device || device.revokedAt || !request.sessionId) {
      return false;
    }
    if (!request.accessGrantToken) {
      return true;
    }
    return Boolean(
      await this.resolveAccessGrantToken(request.accessGrantToken, {
        deviceId: request.deviceId,
        serverId: request.serverId ?? null,
        workspaceId: request.workspaceId ?? null,
        threadId: request.threadId ?? null,
      }),
    );
  }

  async canRespondToApproval(response: RelayApprovalResponse): Promise<boolean> {
    const state = await this.store.load();
    const device = state.devices.find((entry) => entry.deviceId === response.deviceId);
    if (!device || device.revokedAt || !response.sessionId || !response.toolCallId) {
      return false;
    }

    const attachment = state.attachments.find(
      (entry) =>
        entry.deviceId === response.deviceId &&
        entry.sessionId === response.sessionId &&
        !entry.detachedAt &&
        entry.canRespondToApprovals,
    );
    if (!attachment) {
      return false;
    }

    const grant = await this.resolveAccessGrantToken(response.accessGrantToken, {
      deviceId: response.deviceId,
      serverId: response.serverId ?? null,
      threadId: response.threadId ?? null,
    });
    if (grant && attachment.accessGrantId && attachment.accessGrantId !== grant.grantId) {
      return false;
    }
    if (attachment.accessGrantId) {
      const attachmentGrant = state.accessGrants.find(
        (entry) => entry.grantId === attachment.accessGrantId,
      );
      return Boolean(
        attachmentGrant && isGrantActive(attachmentGrant) && attachmentGrant.canRespondToApprovals,
      );
    }
    return Boolean(grant ? grant.canRespondToApprovals : true);
  }

  private async resolveQueuedGrant(
    state: RelayState,
    attachment: RelaySessionAttachmentRecord | undefined,
    token: string | null | undefined,
    scope: {
      deviceId: string;
      serverId?: string | null;
      threadId?: string | null;
    },
  ): Promise<RelayAccessGrantRecord | undefined> {
    if (token) {
      const grant = await this.resolveAccessGrantToken(token, scope);
      if (!grant) {
        throw new Error(`Access grant is invalid or expired for device ${scope.deviceId}`);
      }
      return grant;
    }

    if (!attachment?.accessGrantId) {
      return undefined;
    }

    const grant = state.accessGrants.find((entry) => entry.grantId === attachment.accessGrantId);
    if (!grant || !isGrantActive(grant)) {
      throw new Error(`Access grant expired or revoked: ${attachment.accessGrantId}`);
    }
    return grant;
  }
}
