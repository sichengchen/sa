import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { RelayStore } from "@aria/relay/store";
import { relayCommand } from "../packages/cli/src/relay.js";

let runtimeHome = "";
let originalAriaHome: string | undefined;

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return logs;
}

async function readRepoText(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf-8");
}

beforeEach(async () => {
  runtimeHome = await mkdtemp(join(tmpdir(), "aria-relay-cli-"));
  originalAriaHome = process.env.ARIA_HOME;
  process.env.ARIA_HOME = runtimeHome;
  process.exitCode = 0;
});

afterEach(() => {
  if (originalAriaHome === undefined) {
    delete process.env.ARIA_HOME;
  } else {
    process.env.ARIA_HOME = originalAriaHome;
  }
  process.exitCode = 0;
});

describe("relayCommand", () => {
  test("consumes the public relay package instead of package src internals", async () => {
    const relayCliSource = await readRepoText("packages/cli/src/relay.ts");
    expect(relayCliSource).toContain('from "@aria/relay/service"');
    expect(relayCliSource).toContain('from "@aria/relay/store"');
    expect(relayCliSource).not.toContain("../../relay/src");
  });

  test("manages relay servers and scoped access grants", async () => {
    await relayCommand([
      "server-register",
      "server-1",
      "Home",
      "Server",
      "--metadata",
      "{\"tier\":\"prod\"}",
    ]);
    await relayCommand(["register", "device-1", "My", "Phone"]);
    await relayCommand([
      "grant",
      "server-1",
      "device-1",
      "--workspace",
      "workspace-1",
      "--thread",
      "thread-1",
      "--kind",
      "aria_thread",
      "--transport",
      "relay_tunnel",
      "--send",
      "yes",
      "--respond",
      "no",
      "--issued-at",
      "1000",
      "--ttl",
      "60000",
      "--metadata",
      "{\"scope\":\"mobile\"}",
    ]);

    const state = await new RelayStore(join(runtimeHome, "relay-state.json")).load();
    expect(state.servers).toHaveLength(1);
    expect(state.accessGrants).toHaveLength(1);
    expect(state.accessGrants[0]).toMatchObject({
      serverId: "server-1",
      deviceId: "device-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      attachmentKind: "aria_thread",
      transportMode: "relay_tunnel",
      canSendMessages: true,
      canRespondToApprovals: false,
      issuedAt: 1000,
      expiresAt: 61_000,
    });

    const logs = await captureLogs(async () => {
      await relayCommand(["servers"]);
      await relayCommand(["grants"]);
      await relayCommand(["server-revoke", "server-1"]);
      await relayCommand(["grant-revoke", state.accessGrants[0]!.grantId]);
    });

    expect(logs.some((line) => line.includes("server-1"))).toBe(true);
    expect(logs.some((line) => line.includes("token="))).toBe(true);

    const updated = await new RelayStore(join(runtimeHome, "relay-state.json")).load();
    expect(updated.servers[0]?.revokedAt).toBeNumber();
    expect(updated.accessGrants[0]?.revokedAt).toBeNumber();
  });

  test("manages paired devices, attachments, and queued relay events", async () => {
    await relayCommand(["register", "device-1", "My", "Phone"]);
    await relayCommand(["attach", "device-1", "session-1"]);
    await relayCommand(["send", "device-1", "session-1", "continue", "please"]);
    await relayCommand(["approve", "device-1", "session-1", "tool-1", "approve"]);

    const state = await new RelayStore(join(runtimeHome, "relay-state.json")).load();
    expect(state.devices).toHaveLength(1);
    expect(state.attachments).toHaveLength(1);
    expect(state.events).toHaveLength(2);
    expect(state.events.map((event) => event.type).sort()).toEqual(["approval_response", "follow_up"]);

    const logs = await captureLogs(async () => {
      await relayCommand(["list"]);
      await relayCommand(["attachments"]);
      await relayCommand(["events"]);
      await relayCommand(["deliver", state.events[0]!.eventId]);
      await relayCommand(["detach", "device-1", "session-1"]);
      await relayCommand(["revoke", "device-1"]);
    });

    expect(logs.some((line) => line.includes("device-1"))).toBe(true);
    expect(logs.some((line) => line.includes("session-1"))).toBe(true);

    const updated = await new RelayStore(join(runtimeHome, "relay-state.json")).load();
    expect(updated.devices[0]?.revokedAt).toBeNumber();
    expect(updated.attachments[0]?.detachedAt).toBeNumber();
    expect(updated.events.some((event) => event.deliveredAt)).toBe(true);
  });
});
