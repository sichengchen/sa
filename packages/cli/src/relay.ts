import type { RelayService } from "@aria/relay";
import type { RelayAttachmentKind, RelayTransportMode } from "@aria/relay/types";
import { CLI_NAME, getRuntimeHome } from "@aria/server/brand";
import { runAriaRelayServiceHost } from "aria-relay";

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} relay <subcommand>`);
  console.log("");
  console.log("  list");
  console.log("  register <deviceId> <label>");
  console.log("  revoke <deviceId>");
  console.log("  servers [serverId]");
  console.log(
    "  server-register <serverId> <label> [--enrollment-token <token>] [--metadata <json>]",
  );
  console.log("  server-revoke <serverId>");
  console.log("  grants [serverId]");
  console.log(
    "  grant <serverId> <deviceId> [--workspace <workspaceId>] [--thread <threadId>] [--kind <aria_thread|remote_project_thread|remote_job_stream>] [--transport <direct|relay_assisted|relay_tunnel>] [--send <yes|no>] [--respond <yes|no>] [--issued-at <ms>] [--expires-at <ms>] [--ttl <ms>] [--metadata <json>]",
  );
  console.log("  grant-revoke <grantId>");
  console.log("  attach <deviceId> <sessionId>");
  console.log("  detach <deviceId> <sessionId>");
  console.log("  attachments [deviceId]");
  console.log("  send <deviceId> <sessionId> <message>");
  console.log("  approve <deviceId> <sessionId> <toolCallId> <approve|deny>");
  console.log("  events [deviceId]");
  console.log("  deliver <eventId>");
}

function formatIso(value?: number | null): string {
  return value ? new Date(value).toISOString() : "no";
}

function parseBooleanFlag(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }
  if (["true", "yes", "1", "on", "enabled"].includes(value)) {
    return true;
  }
  if (["false", "no", "0", "off", "disabled"].includes(value)) {
    return false;
  }
  return null;
}

function parseNumberishFlag(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAttachmentKind(value: string | undefined): value is RelayAttachmentKind {
  return (
    value === "aria_thread" || value === "remote_project_thread" || value === "remote_job_stream"
  );
}

function isTransportMode(value: string | undefined): value is RelayTransportMode {
  return value === "direct" || value === "relay_assisted" || value === "relay_tunnel";
}

function parseServerRegistrationArgs(args: string[]): {
  serverId: string;
  label: string;
  enrollmentToken?: string | null;
  metadataJson?: string | null;
} | null {
  const [serverId, ...rest] = args;
  if (!serverId) {
    return null;
  }

  const labelParts: string[] = [];
  const options: {
    enrollmentToken?: string | null;
    metadataJson?: string | null;
  } = {};
  let parsingOptions = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!parsingOptions && !arg.startsWith("--")) {
      labelParts.push(arg);
      continue;
    }

    parsingOptions = true;
    switch (arg) {
      case "--enrollment-token": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.enrollmentToken = value;
        break;
      }
      case "--metadata": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.metadataJson = value;
        break;
      }
      default:
        return null;
    }
  }

  const label = labelParts.join(" ").trim();
  if (!label) {
    return null;
  }

  return {
    serverId,
    label,
    enrollmentToken: options.enrollmentToken ?? undefined,
    metadataJson: options.metadataJson ?? undefined,
  };
}

function parseGrantIssueArgs(args: string[]): {
  serverId: string;
  deviceId: string;
  workspaceId?: string | null;
  threadId?: string | null;
  attachmentKind?: RelayAttachmentKind | null;
  transportMode?: RelayTransportMode | null;
  canSendMessages?: boolean;
  canRespondToApprovals?: boolean;
  issuedAt?: number;
  expiresAt?: number;
  metadataJson?: string | null;
} | null {
  const [serverId, deviceId, ...rest] = args;
  if (!serverId || !deviceId) {
    return null;
  }

  const options: {
    workspaceId?: string | null;
    threadId?: string | null;
    attachmentKind?: RelayAttachmentKind | null;
    transportMode?: RelayTransportMode | null;
    canSendMessages?: boolean;
    canRespondToApprovals?: boolean;
    issuedAt?: number;
    expiresAt?: number;
    ttl?: number;
    metadataJson?: string | null;
  } = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case "--workspace": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.workspaceId = value;
        break;
      }
      case "--thread": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.threadId = value;
        break;
      }
      case "--kind": {
        const value = rest[++index];
        if (!isAttachmentKind(value)) {
          return null;
        }
        options.attachmentKind = value;
        break;
      }
      case "--transport": {
        const value = rest[++index];
        if (!isTransportMode(value)) {
          return null;
        }
        options.transportMode = value;
        break;
      }
      case "--send": {
        const value = parseBooleanFlag(rest[++index]);
        if (value === null) {
          return null;
        }
        options.canSendMessages = value;
        break;
      }
      case "--respond": {
        const value = parseBooleanFlag(rest[++index]);
        if (value === null) {
          return null;
        }
        options.canRespondToApprovals = value;
        break;
      }
      case "--issued-at": {
        const value = parseNumberishFlag(rest[++index]);
        if (value === null) {
          return null;
        }
        options.issuedAt = value;
        break;
      }
      case "--expires-at": {
        const value = parseNumberishFlag(rest[++index]);
        if (value === null) {
          return null;
        }
        options.expiresAt = value;
        break;
      }
      case "--ttl": {
        const value = parseNumberishFlag(rest[++index]);
        if (value === null) {
          return null;
        }
        options.ttl = value;
        break;
      }
      case "--metadata": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.metadataJson = value;
        break;
      }
      default:
        return null;
    }
  }

  const issuedAt = options.issuedAt ?? Date.now();
  const expiresAt =
    options.expiresAt ?? (options.ttl !== undefined ? issuedAt + options.ttl : undefined);

  return {
    serverId,
    deviceId,
    workspaceId: options.workspaceId ?? undefined,
    threadId: options.threadId ?? undefined,
    attachmentKind: options.attachmentKind ?? undefined,
    transportMode: options.transportMode ?? undefined,
    canSendMessages: options.canSendMessages,
    canRespondToApprovals: options.canRespondToApprovals,
    issuedAt,
    expiresAt,
    metadataJson: options.metadataJson ?? undefined,
  };
}

function formatServerSummary(
  server: Awaited<ReturnType<RelayService["listServers"]>>[number],
): string {
  const metadata = [
    `registered=${new Date(server.registeredAt).toISOString()}`,
    `revoked=${formatIso(server.revokedAt)}`,
    `token=${server.enrollmentToken ?? "n/a"}`,
  ];
  if (server.lastSeenAt) {
    metadata.push(`last-seen=${new Date(server.lastSeenAt).toISOString()}`);
  }
  return `${server.serverId}  ${server.label}  ${metadata.join("  ")}`;
}

function formatGrantSummary(
  grant: Awaited<ReturnType<RelayService["listAccessGrants"]>>[number],
): string {
  const metadata = [
    `server=${grant.serverId}`,
    `device=${grant.deviceId}`,
    `workspace=${grant.workspaceId ?? "n/a"}`,
    `thread=${grant.threadId ?? "n/a"}`,
    `kind=${grant.attachmentKind ?? "n/a"}`,
    `transport=${grant.transportMode ?? "n/a"}`,
    `send=${grant.canSendMessages ? "yes" : "no"}`,
    `approve=${grant.canRespondToApprovals ? "yes" : "no"}`,
    `issued=${new Date(grant.issuedAt).toISOString()}`,
    `expires=${new Date(grant.expiresAt).toISOString()}`,
    `revoked=${formatIso(grant.revokedAt)}`,
    `token=${grant.grantToken}`,
  ];
  return `${grant.grantId}  ${metadata.join("  ")}`;
}

export async function relayCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  const { relay } = await runAriaRelayServiceHost({
    runtimeHome: getRuntimeHome(),
  });

  if (action === "list") {
    const devices = await relay.listDevices();
    if (devices.length === 0) {
      console.log("No relay devices registered.");
      return;
    }
    for (const device of devices) {
      console.log(
        `${device.deviceId}  ${device.label}  paired=${new Date(device.pairedAt).toISOString()}  revoked=${device.revokedAt ? new Date(device.revokedAt).toISOString() : "no"}  token=${device.pairingToken ?? "n/a"}`,
      );
    }
    return;
  }

  if (action === "servers") {
    const servers = await relay.listServers();
    const serverId = args[1];
    const filtered = serverId ? servers.filter((server) => server.serverId === serverId) : servers;
    if (filtered.length === 0) {
      console.log("No relay servers registered.");
      return;
    }
    for (const server of filtered) {
      console.log(formatServerSummary(server));
    }
    return;
  }

  if (action === "server-register") {
    const parsed = parseServerRegistrationArgs(args.slice(1));
    if (!parsed) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const server = await relay.registerServer({
      serverId: parsed.serverId,
      label: parsed.label,
      registeredAt: Date.now(),
      revokedAt: null,
      lastSeenAt: null,
      metadataJson: parsed.metadataJson ?? null,
      enrollmentToken: parsed.enrollmentToken ?? null,
    });
    console.log(`Registered relay server ${server.serverId}.`);
    return;
  }

  if (action === "server-revoke") {
    const serverId = args[1];
    if (!serverId) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await relay.revokeServer(serverId);
    console.log(`Revoked relay server ${serverId}.`);
    return;
  }

  if (action === "grants") {
    const serverId = args[1];
    const grants = await relay.listAccessGrants(serverId ? { serverId } : {});
    if (grants.length === 0) {
      console.log("No relay access grants found.");
      return;
    }
    for (const grant of grants) {
      console.log(formatGrantSummary(grant));
    }
    return;
  }

  if (action === "grant") {
    const parsed = parseGrantIssueArgs(args.slice(1));
    if (!parsed) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const grant = await relay.issueAccessGrant({
      serverId: parsed.serverId,
      deviceId: parsed.deviceId,
      workspaceId: parsed.workspaceId ?? null,
      threadId: parsed.threadId ?? null,
      attachmentKind: parsed.attachmentKind ?? null,
      transportMode: parsed.transportMode ?? null,
      canSendMessages: parsed.canSendMessages,
      canRespondToApprovals: parsed.canRespondToApprovals,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
      metadataJson: parsed.metadataJson ?? null,
    });
    console.log(`Issued relay access grant ${grant.grantId}. token=${grant.grantToken}`);
    return;
  }

  if (action === "grant-revoke") {
    const grantId = args[1];
    if (!grantId) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await relay.revokeAccessGrant(grantId);
    console.log(`Revoked relay access grant ${grantId}.`);
    return;
  }

  if (action === "register") {
    const [deviceId, ...labelParts] = args.slice(1);
    const label = labelParts.join(" ").trim();
    if (!deviceId || !label) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const device = await relay.registerDevice({
      deviceId,
      label,
      pairedAt: Date.now(),
      revokedAt: null,
    });
    console.log(`Registered relay device ${device.deviceId}.`);
    return;
  }

  if (action === "revoke") {
    const deviceId = args[1];
    if (!deviceId) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await relay.revokeDevice(deviceId);
    console.log(`Revoked relay device ${deviceId}.`);
    return;
  }

  if (action === "attach") {
    const [deviceId, sessionId] = args.slice(1);
    if (!deviceId || !sessionId) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const attachment = await relay.attachSession({ deviceId, sessionId });
    console.log(`Attached ${attachment.deviceId} to ${attachment.sessionId}.`);
    return;
  }

  if (action === "detach") {
    const [deviceId, sessionId] = args.slice(1);
    if (!deviceId || !sessionId) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const attachment = await relay.detachSession(deviceId, sessionId);
    if (!attachment) {
      console.log("No active attachment found.");
      return;
    }
    console.log(`Detached ${deviceId} from ${sessionId}.`);
    return;
  }

  if (action === "attachments") {
    const attachments = await relay.listAttachments(args[1]);
    if (attachments.length === 0) {
      console.log("No relay attachments found.");
      return;
    }
    for (const attachment of attachments) {
      console.log(
        `${attachment.attachmentId}  device=${attachment.deviceId}  session=${attachment.sessionId}  detached=${attachment.detachedAt ? "yes" : "no"}  send=${attachment.canSendMessages ? "yes" : "no"}  approve=${attachment.canRespondToApprovals ? "yes" : "no"}`,
      );
    }
    return;
  }

  if (action === "send") {
    const [deviceId, sessionId, ...messageParts] = args.slice(1);
    const message = messageParts.join(" ").trim();
    if (!deviceId || !sessionId || !message) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const event = await relay.queueFollowUp({ deviceId, sessionId, message });
    console.log(`Queued follow-up event ${event.eventId}.`);
    return;
  }

  if (action === "approve") {
    const [deviceId, sessionId, toolCallId, decision] = args.slice(1);
    if (!deviceId || !sessionId || !toolCallId || !decision) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    const approved = decision === "approve" || decision === "approved" || decision === "yes";
    const event = await relay.queueApprovalResponse({
      deviceId,
      sessionId,
      toolCallId,
      approved,
    });
    console.log(`Queued approval response ${event.eventId}.`);
    return;
  }

  if (action === "events") {
    const events = await relay.listEvents(args[1]);
    if (events.length === 0) {
      console.log("No relay events found.");
      return;
    }
    for (const event of events) {
      console.log(
        `${event.eventId}  ${event.type}  device=${event.deviceId}  session=${event.sessionId}  delivered=${event.deliveredAt ? "yes" : "no"}`,
      );
    }
    return;
  }

  if (action === "deliver") {
    const eventId = args[1];
    if (!eventId) {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await relay.markDelivered(eventId);
    console.log(`Marked relay event ${eventId} delivered.`);
    return;
  }

  printHelp();
  process.exitCode = 1;
}
