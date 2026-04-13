import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  createAriaRelayServiceBootstrap,
  resolveAriaRelayStatePath,
  runAriaRelayServiceHost,
} from "../services/aria-relay/src/index.js";

describe("relay service surface", () => {
  test("exposes a thin relay wrapper over @aria/relay", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-relay-service-"));
    try {
      const bootstrap = createAriaRelayServiceBootstrap(join(dir, "relay-state.json"));
      expect(bootstrap.service).toMatchObject({
        id: "aria-relay",
        displayName: "Aria Relay",
        surface: "relay",
        sharedPackages: ["@aria/relay", "@aria/protocol"],
        planes: ["control", "data", "push"],
      });
      expect(bootstrap.service.capabilities).toContain("direct-or-relayed-routing");
      expect(bootstrap.statePath).toBe(join(dir, "relay-state.json"));

      const device = await bootstrap.relay.registerDevice({
        deviceId: "device-1",
        label: "Phone",
        pairedAt: 1,
      });
      const server = await bootstrap.relay.registerServer({
        serverId: "server-1",
        label: "Home",
        registeredAt: 1,
      });
      const grant = await bootstrap.relay.issueAccessGrant({
        serverId: "server-1",
        deviceId: "device-1",
        threadId: "thread-1",
        attachmentKind: "remote_project_thread",
        transportMode: "relay_tunnel",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10_000,
      });
      const attachment = await bootstrap.relay.attachSession({
        deviceId: "device-1",
        sessionId: "session-1",
        serverId: "server-1",
        threadId: "thread-1",
        accessGrantToken: grant.grantToken,
        attachmentKind: "remote_project_thread",
        transportMode: "relay_tunnel",
      });

      expect(device.deviceId).toBe("device-1");
      expect(server.serverId).toBe("server-1");
      expect(attachment).toMatchObject({
        serverId: "server-1",
        threadId: "thread-1",
        attachmentKind: "remote_project_thread",
        transportMode: "relay_tunnel",
        resumable: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("resolves relay state paths and runs the thin relay host", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aria-relay-host-"));
    try {
      expect(resolveAriaRelayStatePath(dir)).toBe(join(dir, "relay-state.json"));

      const host = await runAriaRelayServiceHost({ runtimeHome: dir });
      expect(host.statePath).toBe(join(dir, "relay-state.json"));
      expect(await host.store.load()).toEqual({
        servers: [],
        devices: [],
        accessGrants: [],
        attachments: [],
        events: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
