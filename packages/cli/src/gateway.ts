import { createTuiClient } from "@aria/console/client.js";
import { CLI_NAME, RUNTIME_NAME } from "@aria/server/brand";
import { ensureEngine } from "./engine.js";

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} gateway <subcommand>`);
  console.log("");
  console.log("  pair-code");
  console.log("  status");
}

export async function gatewayCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "status";

  if (action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  if (action === "status") {
    await ensureEngine();
    const client = createTuiClient();
    const health = await client.health.ping.query();
    console.log(`${RUNTIME_NAME}: ${health.status}`);
    console.log(`Agent: ${health.agentName}`);
    return;
  }

  if (action === "pair-code") {
    await ensureEngine();
    const client = createTuiClient();
    const { code } = await client.auth.code.query();
    console.log(`Gateway pairing code: ${code}`);
    console.log("This code is one-time use and expires automatically.");
    return;
  }

  printHelp();
  process.exitCode = 1;
}
