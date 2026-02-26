#!/usr/bin/env bun

import React from "react";
import { render } from "ink";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { engineCommand, ensureEngine } from "./engine.js";
import { createTuiClient } from "@sa/connectors/tui/client.js";
import { App } from "@sa/connectors/tui/App.js";

const saHome = process.env.SA_HOME ?? join(homedir(), ".sa");
const [subcommand, ...args] = process.argv.slice(2);

async function runOnboarding(existingConfig?: unknown): Promise<void> {
  const { Wizard } = await import("./wizard/index.js");
  return new Promise<void>((resolve) => {
    const instance = render(
      React.createElement(Wizard, {
        homeDir: saHome,
        existingConfig: existingConfig as any,
        onComplete: () => {
          instance.unmount();
          resolve();
        },
      })
    );
  });
}

async function loadExistingConfig(): Promise<unknown | undefined> {
  try {
    const { ConfigManager } = await import("../engine/config/index.js");
    const config = new ConfigManager(saHome);
    const saConfig = await config.load();
    const secrets = await config.loadSecrets();
    const defaultModel = saConfig.models?.[0];
    const defaultProvider = saConfig.providers?.find(
      (p: { id: string }) => p.id === defaultModel?.provider
    ) ?? saConfig.providers?.[0];
    const userProfile = await config.loadUserProfile();
    let userName = "";
    let timezone = "";
    let communicationStyle = "";
    let aboutMe = "";
    if (userProfile) {
      const nameMatch = userProfile.match(/^Name:\s*(.+)/m);
      if (nameMatch) userName = nameMatch[1].trim();
      const tzMatch = userProfile.match(/^Timezone:\s*(.+)/m);
      if (tzMatch && tzMatch[1].trim() !== "not set") timezone = tzMatch[1].trim();
      const styleMatch = userProfile.match(/^Communication style:\s*(.+)/m);
      if (styleMatch && styleMatch[1].trim() !== "not set") communicationStyle = styleMatch[1].trim();
      const aboutMatch = userProfile.match(/^Timezone:.*\n\n([\s\S]*?)\n\n## Preferences/m);
      if (aboutMatch && aboutMatch[1].trim()) aboutMe = aboutMatch[1].trim();
    }
    return {
      name: saConfig.identity.name,
      personality: saConfig.identity.personality,
      userName,
      timezone,
      communicationStyle,
      aboutMe,
      providerId: defaultProvider?.id ?? "anthropic",
      providerType: defaultProvider?.type ?? "anthropic",
      provider: defaultProvider?.id ?? "anthropic",
      model: defaultModel?.model ?? "",
      apiKeyEnvVar: defaultProvider?.apiKeyEnvVar ?? "ANTHROPIC_API_KEY",
      baseUrl: defaultProvider?.baseUrl,
      apiKey: secrets?.apiKeys?.[defaultProvider?.apiKeyEnvVar ?? ""] ?? "",
      botToken: secrets?.apiKeys?.TELEGRAM_BOT_TOKEN ?? secrets?.botToken ?? "",
      pairingCode: secrets?.pairingCode,
      discordToken: secrets?.apiKeys?.DISCORD_TOKEN ?? secrets?.discordToken ?? "",
      discordGuildId: secrets?.apiKeys?.DISCORD_GUILD_ID ?? secrets?.discordGuildId ?? "",
    };
  } catch {
    return undefined;
  }
}

function isConfigured(): boolean {
  return existsSync(join(saHome, "config.json"));
}

async function openTui(): Promise<void> {
  await ensureEngine();
  const client = createTuiClient();
  const { waitUntilExit } = render(React.createElement(App, { client }));
  await waitUntilExit();
}

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  engine: engineCommand,
  audit: async (cmdArgs) => {
    const { auditCommand } = await import("./audit.js");
    await auditCommand(cmdArgs);
  },
  config: async () => {
    if (!isConfigured()) {
      console.error("No configuration found. Run 'sa onboard' first.");
      process.exit(1);
    }
    const { runConfig } = await import("./config/index.js");
    await runConfig(saHome);
    console.log("\nRun 'sa engine restart' to apply changes to the running Engine.");
  },
  onboard: async () => {
    const existing = isConfigured() ? await loadExistingConfig() : undefined;
    await runOnboarding(existing);
  },
  slack: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3420;
    const { startSlackConnector } = await import("@sa/connectors/slack/index.js");
    await startSlackConnector(port);
  },
  teams: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3421;
    const { startTeamsConnector } = await import("@sa/connectors/teams/index.js");
    await startTeamsConnector(port);
  },
  gchat: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3422;
    const { startGChatConnector } = await import("@sa/connectors/gchat/index.js");
    await startGChatConnector(port);
  },
  github: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3424;
    const { startGitHubConnector } = await import("@sa/connectors/github/index.js");
    await startGitHubConnector(port);
  },
  linear: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3425;
    const { startLinearConnector } = await import("@sa/connectors/linear/index.js");
    await startLinearConnector(port);
  },
  discord: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3423;
    const { startDiscordConnector } = await import("@sa/connectors/discord/index.js");
    await startDiscordConnector(port);
  },
  __engine: async () => {
    await import("@sa/engine/index.js");
  },
  help: async () => {
    console.log("SA — Personal AI Agent Assistant\n");
    console.log("Usage: sa [command]\n");
    console.log("Commands:");
    console.log("  (default)   Start the Engine (if needed) and open the TUI");
    console.log("  audit       View the audit log (--tail N, --tool, --event, --since, --json)");
    console.log("  config      Interactive configuration editor");
    console.log("  onboard     Run the onboarding wizard");
    console.log("  engine      Manage the Engine daemon (start/stop/status/logs/restart)");
    console.log("  discord     Start the Discord connector (webhook server on port 3423)");
    console.log("  slack       Start the Slack connector (webhook server on port 3420)");
    console.log("  teams       Start the Teams connector (webhook server on port 3421)");
    console.log("  gchat       Start the Google Chat connector (webhook server on port 3422)");
    console.log("  github      Start the GitHub connector (webhook server on port 3424)");
    console.log("  linear      Start the Linear connector (webhook server on port 3425)");
    console.log("  help        Show this help message\n");
    console.log("Flags:");
    console.log("  --help, -h  Show this help message");
  },
};

async function main() {
  if (!subcommand) {
    if (!isConfigured()) {
      await runOnboarding();
      return;
    }
    await openTui();
    return;
  }

  // Handle --help / -h flags as aliases for the help command
  if (subcommand === "--help" || subcommand === "-h") {
    await COMMANDS.help!(args);
    return;
  }

  const handler = COMMANDS[subcommand];
  if (!handler) {
    console.error(`Unknown command: ${subcommand}`);
    console.error("Run 'sa help' for usage information.");
    process.exit(1);
  }

  await handler(args);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
