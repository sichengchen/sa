#!/usr/bin/env bun

import { engineCommand } from "./engine.js";

const [subcommand, ...args] = process.argv.slice(2);

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  engine: engineCommand,
};

async function main() {
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log("SA CLI — Personal AI Agent Assistant\n");
    console.log("Usage: sa <command> [options]\n");
    console.log("Commands:");
    console.log("  engine    Manage the SA Engine daemon (start/stop/status/logs/restart)");
    console.log("\nRun 'sa <command> --help' for more information on a command.");
    return;
  }

  const handler = COMMANDS[subcommand];
  if (!handler) {
    console.error(`Unknown command: ${subcommand}`);
    console.error("Run 'sa --help' for usage information.");
    process.exit(1);
  }

  await handler(args);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
