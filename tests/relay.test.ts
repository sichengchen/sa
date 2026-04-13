import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { RelayService } from "../packages/relay/src/service.js";
import { RelayStore } from "../packages/relay/src/store.js";

async function createRelayService(): Promise<RelayService> {
  const dir = await mkdtemp(join(tmpdir(), "aria-relay-"));
  return new RelayService(new RelayStore(join(dir, "relay-state.json")));
}

describe("RelayService", () => {
  test("persists servers, grants, devices, attachments, and queued events", async () => {
    const relay = await createRelayService();

    const device = await relay.registerDevice({
      deviceId: "device-1",
      label: "Phone",
      pairedAt: Date.now(),
      revokedAt: null,
    });
    expect(device.pairingToken).toBeString();

    const server = await relay.registerServer({
      serverId: "server-1",
      label: "Home Server",
      registeredAt: Date.now(),
      revokedAt: null,
    });
    expect(server.enrollmentToken).toBeString();

    const grant = await relay.issueAccessGrant({
      serverId: "server-1",
      deviceId: "device-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      attachmentKind: "aria_thread",
      transportMode: "relay_tunnel",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    expect(grant.grantToken).toBeString();

    const attachment = await relay.attachSession({
      deviceId: "device-1",
      sessionId: "session-1",
      serverId: "server-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      accessGrantToken: grant.grantToken,
      attachmentKind: "aria_thread",
      transportMode: "relay_tunnel",
    });
    expect(attachment.sessionId).toBe("session-1");
    expect(attachment).toMatchObject({
      serverId: "server-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      accessGrantId: grant.grantId,
      attachmentKind: "aria_thread",
      transportMode: "relay_tunnel",
      resumable: true,
    });

    const followUp = await relay.queueFollowUp({
      deviceId: "device-1",
      sessionId: "session-1",
      message: "Continue the work.",
      serverId: "server-1",
      threadId: "thread-1",
      accessGrantToken: grant.grantToken,
    });
    const approval = await relay.queueApprovalResponse({
      deviceId: "device-1",
      sessionId: "session-1",
      toolCallId: "tool-1",
      approved: true,
      serverId: "server-1",
      threadId: "thread-1",
      accessGrantToken: grant.grantToken,
    });

    expect(followUp.type).toBe("follow_up");
    expect(approval.type).toBe("approval_response");
    expect(followUp.serverId).toBe("server-1");
    expect(approval.threadId).toBe("thread-1");
    expect(followUp.accessGrantId).toBe(grant.grantId);
    expect(await relay.listEvents("device-1", false)).toHaveLength(2);
    expect(await relay.listAccessGrants({ serverId: "server-1" })).toHaveLength(1);
    expect(await relay.listServers()).toHaveLength(1);

    await relay.markDelivered(followUp.eventId);
    expect(await relay.listEvents("device-1", false)).toHaveLength(1);

    await relay.detachSession("device-1", "session-1");
    expect(
      await relay.canRespondToApproval({
        deviceId: "device-1",
        sessionId: "session-1",
        toolCallId: "tool-1",
        approved: true,
      }),
    ).toBe(false);
  });

  test("rejects mismatched or expired access grants", async () => {
    const relay = await createRelayService();

    await relay.registerDevice({
      deviceId: "device-2",
      label: "Tablet",
      pairedAt: Date.now(),
      revokedAt: null,
    });
    await relay.registerServer({
      serverId: "server-2",
      label: "Office",
      registeredAt: Date.now(),
      revokedAt: null,
    });

    const grant = await relay.issueAccessGrant({
      serverId: "server-2",
      deviceId: "device-2",
      threadId: "thread-2",
      issuedAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1,
    });

    await expect(
      relay.attachSession({
        deviceId: "device-2",
        sessionId: "session-2",
        serverId: "server-2",
        threadId: "thread-2",
        accessGrantToken: grant.grantToken,
      }),
    ).rejects.toThrow("Access grant is invalid or expired for device device-2");

    const freshGrant = await relay.issueAccessGrant({
      serverId: "server-2",
      deviceId: "device-2",
      threadId: "thread-2",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });

    await expect(
      relay.attachSession({
        deviceId: "device-2",
        sessionId: "session-2",
        serverId: "server-2",
        threadId: "thread-3",
        accessGrantToken: freshGrant.grantToken,
      }),
    ).rejects.toThrow("Access grant is invalid or expired for device device-2");
  });

  test("rejects missing devices, revoked devices, and unknown events", async () => {
    const relay = await createRelayService();

    await expect(relay.revokeDevice("missing-device")).rejects.toThrow(
      "Device not found: missing-device",
    );

    await relay.registerDevice({
      deviceId: "device-2",
      label: "Tablet",
      pairedAt: Date.now(),
      revokedAt: null,
    });
    await relay.revokeDevice("device-2");

    await expect(
      relay.attachSession({ deviceId: "device-2", sessionId: "session-2" }),
    ).rejects.toThrow("Device not found or revoked: device-2");

    await expect(
      relay.queueFollowUp({ deviceId: "device-2", sessionId: "session-2", message: "hi" }),
    ).rejects.toThrow("Device device-2 is not attached to session session-2");

    await expect(relay.markDelivered("missing-event")).rejects.toThrow(
      "Relay event not found: missing-event",
    );
  });
});
