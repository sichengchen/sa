import { join } from "node:path";
import { RelayService } from "@aria/relay/service";
import { RelayStore } from "@aria/relay/store";
import { CLI_NAME, getRuntimeHome } from "@aria/server/brand";

const RELAY_STORE_FILE = "relay-state.json";

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} relay <subcommand>`);
  console.log("");
  console.log("  list");
  console.log("  register <deviceId> <label>");
  console.log("  revoke <deviceId>");
  console.log("  attach <deviceId> <sessionId>");
  console.log("  detach <deviceId> <sessionId>");
  console.log("  attachments [deviceId]");
  console.log("  send <deviceId> <sessionId> <message>");
  console.log("  approve <deviceId> <sessionId> <toolCallId> <approve|deny>");
  console.log("  events [deviceId]");
  console.log("  deliver <eventId>");
}

export async function relayCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  const store = new RelayStore(join(getRuntimeHome(), RELAY_STORE_FILE));
  const relay = new RelayService(store);

  if (action === "list") {
    const devices = await relay.listDevices();
    if (devices.length === 0) {
      console.log("No relay devices registered.");
      return;
    }
    for (const device of devices) {
      console.log(`${device.deviceId}  ${device.label}  paired=${new Date(device.pairedAt).toISOString()}  revoked=${device.revokedAt ? new Date(device.revokedAt).toISOString() : "no"}  token=${device.pairingToken ?? "n/a"}`);
    }
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
      console.log(`${attachment.attachmentId}  device=${attachment.deviceId}  session=${attachment.sessionId}  detached=${attachment.detachedAt ? "yes" : "no"}  send=${attachment.canSendMessages ? "yes" : "no"}  approve=${attachment.canRespondToApprovals ? "yes" : "no"}`);
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
    const event = await relay.queueApprovalResponse({ deviceId, sessionId, toolCallId, approved });
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
      console.log(`${event.eventId}  ${event.type}  device=${event.deviceId}  session=${event.sessionId}  delivered=${event.deliveredAt ? "yes" : "no"}`);
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
