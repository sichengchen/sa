#!/usr/bin/env bun

import { engineCommand } from "./engine.js";
import { tuiCommand, telegramCommand, discordCommand } from "./connectors.js";

const [subcommand, ...args] = process.argv.slice(2);

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  engine: engineCommand,
  tui: () => tuiCommand(),
  telegram: () => telegramCommand(),
  discord: () => discordCommand(),
};

async function main() {
  // No subcommand or bare "sa" → auto-start Engine + enter TUI
  if (!subcommand) {
    await tuiCommand();
    return;
  }

  if (subcommand === "--help" || subcommand === "-h") {
    console.log("SA — Personal AI Agent Assistant\n");
    console.log("Usage: sa [command]\n");
    console.log("Commands:");
    console.log("  (default)   Start the Engine (if needed) and enter the TUI");
    console.log("  tui         Start the TUI connector");
    console.log("  telegram    Start the Telegram connector");
    console.log("  discord     Start the Discord connector");
    console.log("  engine      Manage the Engine daemon (start/stop/status/logs/restart)");
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
