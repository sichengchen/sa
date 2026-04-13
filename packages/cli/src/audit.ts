import { existsSync } from "node:fs";
import { join } from "node:path";
import { queryAuditEntries, type AuditEntry } from "@aria/audit";
import { CLI_NAME, PRODUCT_NAME, getRuntimeHome } from "@aria/server/brand";

/** ANSI color helpers */
const COLORS: Record<string, string> = {
  tool_call: "\x1b[36m", // cyan
  tool_result: "\x1b[90m", // dim
  tool_approval: "\x1b[32m", // green
  tool_denial: "\x1b[31m", // red
  security_block: "\x1b[31m", // red
  security_escalation: "\x1b[33m", // yellow
  auth_success: "\x1b[32m", // green
  auth_failure: "\x1b[31m", // red
  mode_change: "\x1b[33m", // yellow
  session_create: "\x1b[90m", // dim
  session_destroy: "\x1b[90m", // dim
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function parseArgs(args: string[]): {
  tail: number;
  tool?: string;
  event?: string;
  since?: string;
  session?: string;
  json: boolean;
} {
  let tail = 20;
  let tool: string | undefined;
  let event: string | undefined;
  let since: string | undefined;
  let session: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--tail" && args[i + 1]) {
      tail = parseInt(args[++i]!, 10);
      if (isNaN(tail) || tail <= 0) tail = 20;
    } else if (arg === "--tool" && args[i + 1]) {
      tool = args[++i]!;
    } else if (arg === "--event" && args[i + 1]) {
      event = args[++i]!;
    } else if (arg === "--since" && args[i + 1]) {
      since = args[++i]!;
    } else if (arg === "--session" && args[i + 1]) {
      session = args[++i]!;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { tail, tool, event, since, session, json };
}

function printHelp(): void {
  console.log(`${CLI_NAME} audit — View the ${PRODUCT_NAME} audit log\n`);
  console.log(`Usage: ${CLI_NAME} audit [options]\n`);
  console.log("Options:");
  console.log("  --tail N       Show last N entries (default: 20)");
  console.log("  --tool NAME    Filter by tool name (e.g. exec, web_fetch)");
  console.log("  --event TYPE   Filter by event type (e.g. auth_failure, tool_call)");
  console.log("  --since DATE   Filter entries after date (e.g. 2026-02-01)");
  console.log("  --session ID   Filter by session ID or prefix");
  console.log("  --json         Output raw NDJSON (for piping)");
  console.log("  --help, -h     Show this help message");
}

function formatEntry(entry: AuditEntry): string {
  const time = entry.ts.replace("T", " ").slice(0, 19);
  const color = COLORS[entry.event] ?? "";
  const eventStr = `${color}${entry.event.padEnd(22)}${RESET}`;
  const session = entry.session.slice(0, 24).padEnd(24);

  let detail = "";
  if (entry.tool) detail += entry.tool;
  if (entry.command) detail += ` $ ${entry.command}`;
  if (entry.url) detail += ` ${entry.url}`;
  if (entry.summary && !entry.command && !entry.url) detail += ` ${entry.summary}`;
  if (entry.escalation) detail += ` [${entry.escalation.layer}→${entry.escalation.choice}]`;

  return `${time}  ${eventStr}  ${session}  ${detail}`;
}

export async function auditCommand(args: string[]): Promise<void> {
  const runtimeHome = getRuntimeHome();
  const logPath = join(runtimeHome, "audit.log");

  if (!existsSync(logPath)) {
    console.log("No audit log found. The engine has not been started yet.");
    return;
  }

  const opts = parseArgs(args);
  const entries = queryAuditEntries(logPath, opts);

  if (entries.length === 0) {
    console.log("No matching audit entries found.");
    return;
  }

  if (opts.json) {
    for (const entry of entries) {
      console.log(JSON.stringify(entry));
    }
  } else {
    // Header
    console.log(`${"Time".padEnd(19)}  ${"Event".padEnd(22)}  ${"Session".padEnd(24)}  Detail`);
    console.log("-".repeat(90));
    for (const entry of entries) {
      console.log(formatEntry(entry));
    }
    console.log(`\n${entries.length} entries shown`);
  }
}
