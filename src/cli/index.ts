#!/usr/bin/env bun

import React from "react";
import { render } from "ink";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { engineCommand, ensureEngine } from "./engine.js";
import { automationCommand } from "./automation.js";
import { memoryCommand } from "./memory.js";
import { createTuiClient } from "@aria/connectors/tui/client.js";
import { App } from "@aria/connectors/tui/App.js";
import { CLI_NAME, PRODUCT_NAME, RUNTIME_NAME, getRuntimeHome } from "@aria/shared/brand.js";

const runtimeHome = getRuntimeHome();
const [subcommand, ...args] = process.argv.slice(2);

async function runOnboarding(existingConfig?: unknown): Promise<void> {
  const { Wizard } = await import("./wizard/index.js");
  return new Promise<void>((resolve) => {
    const instance = render(
      React.createElement(Wizard, {
        homeDir: runtimeHome,
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
    const config = new ConfigManager(runtimeHome);
    const ariaConfig = await config.load();
    const secrets = await config.loadSecrets();
    const defaultModel = ariaConfig.models?.[0];
    const defaultProvider = ariaConfig.providers?.find(
      (p: { id: string }) => p.id === defaultModel?.provider
    ) ?? ariaConfig.providers?.[0];
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
      name: ariaConfig.identity.name,
      personality: ariaConfig.identity.personality,
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
  return existsSync(join(runtimeHome, "config.json"));
}

async function openTui(): Promise<void> {
  await ensureEngine();
  const client = createTuiClient();
  const { waitUntilExit } = render(React.createElement(App, { client }));
  await waitUntilExit();
}

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  engine: engineCommand,
  automation: automationCommand,
  audit: async (cmdArgs) => {
    const { auditCommand } = await import("./audit.js");
    await auditCommand(cmdArgs);
  },
  memory: memoryCommand,
  config: async () => {
    if (!isConfigured()) {
      console.error(`No configuration found. Run '${CLI_NAME} onboard' first.`);
      process.exit(1);
    }
    const { runConfig } = await import("./config/index.js");
    await runConfig(runtimeHome);
    console.log(`\nRun '${CLI_NAME} engine restart' to apply changes to the running runtime.`);
  },
  onboard: async () => {
    const existing = isConfigured() ? await loadExistingConfig() : undefined;
    await runOnboarding(existing);
  },
  slack: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3420;
    const { startSlackConnector } = await import("@aria/connectors/slack/index.js");
    await startSlackConnector(port);
  },
  teams: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3421;
    const { startTeamsConnector } = await import("@aria/connectors/teams/index.js");
    await startTeamsConnector(port);
  },
  gchat: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3422;
    const { startGChatConnector } = await import("@aria/connectors/gchat/index.js");
    await startGChatConnector(port);
  },
  github: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3424;
    const { startGitHubConnector } = await import("@aria/connectors/github/index.js");
    await startGitHubConnector(port);
  },
  linear: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3425;
    const { startLinearConnector } = await import("@aria/connectors/linear/index.js");
    await startLinearConnector(port);
  },
  shutdown: async () => {
      const { createTuiClient } = await import("@aria/connectors/tui/client.js");
      try {
        const client = createTuiClient();
        console.log(`Shutting down ${RUNTIME_NAME}...`);
        await client.engine.shutdown.mutate();
        console.log(`${RUNTIME_NAME} stopped.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to shut down: ${msg}`);
        console.error(`Is the runtime running? Try '${CLI_NAME} engine status'.`);
        process.exit(1);
      }
  },
  restart: async () => {
      const { createTuiClient } = await import("@aria/connectors/tui/client.js");
      try {
        const client = createTuiClient();
        console.log(`Restarting ${RUNTIME_NAME}...`);
        await client.engine.restart.mutate();
      // Wait for engine to come back up
      let retries = 0;
        while (retries < 30) {
        await new Promise((r) => setTimeout(r, 500));
          try {
            const freshClient = createTuiClient();
            await freshClient.health.ping.query();
            console.log(`${RUNTIME_NAME} restarted successfully.`);
            return;
          } catch {
            retries++;
          }
        }
        console.log(`${RUNTIME_NAME} restart initiated. It may still be starting up.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to restart: ${msg}`);
        console.error(`Is the runtime running? Try '${CLI_NAME} engine restart'.`);
        process.exit(1);
      }
  },
  stop: async () => {
    const { createTuiClient } = await import("@aria/connectors/tui/client.js");
    try {
      const client = createTuiClient();
      const result = await client.chat.stopAll.mutate();
      if (result.cancelled > 0) {
        console.log(`Stopped ${result.cancelled} running agent(s) out of ${result.total} total.`);
      } else {
        console.log("No agents are currently running.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to stop agents: ${msg}`);
      console.error(`Is the runtime running? Try '${CLI_NAME} engine status'.`);
      process.exit(1);
    }
  },
  telegram: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3426;
    const { startTelegramConnector } = await import("@aria/connectors/telegram/index.js");
    await startTelegramConnector(port);
  },
  discord: async (cmdArgs) => {
    const port = cmdArgs[0] ? parseInt(cmdArgs[0], 10) : 3423;
    const { startDiscordConnector } = await import("@aria/connectors/discord/index.js");
    await startDiscordConnector(port);
  },
  __engine: async () => {
    await import("@aria/engine/index.js");
  },
  help: async () => {
    console.log(`${PRODUCT_NAME} — Local-First Agent Platform\n`);
    console.log(`Usage: ${CLI_NAME} [command]\n`);
    console.log("Commands:");
    console.log("  (default)   Start the runtime (if needed) and open the TUI");
    console.log("  automation  Inspect durable automation tasks and runs");
    console.log("  audit       View the audit log (--tail N, --tool, --event, --since, --json)");
    console.log("  config      Interactive configuration editor");
    console.log("  onboard     Run the onboarding wizard");
    console.log("  memory      Inspect layered memory and search results");
    console.log("  engine      Manage the runtime daemon (start/stop/status/logs/restart)");
    console.log("  stop        Stop all running agent tasks");
    console.log("  restart     Restart Aria Runtime");
    console.log("  shutdown    Stop Aria Runtime completely");
    console.log("  telegram    Start the Telegram connector (webhook server on port 3426)");
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
    console.error(`Run '${CLI_NAME} help' for usage information.`);
    process.exit(1);
  }

  await handler(args);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
