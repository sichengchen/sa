import { existsSync } from "node:fs";
import { join } from "node:path";
import { ConfigManager } from "@aria/server/config";
import { loadSecrets } from "@aria/server/config/secrets";
import { getRuntimeHome } from "@aria/server/brand";

/**
 * Load connector-facing environment variables from the runtime home.
 *
 * Remote connector subcommands run as standalone processes, so they need the
 * same secret/env hydration the engine does before their adapters initialize.
 */
export async function loadConnectorRuntimeEnv(homeDir = getRuntimeHome()): Promise<void> {
  const configPath = join(homeDir, "config.json");

  if (existsSync(configPath)) {
    const config = new ConfigManager(homeDir);
    const ariaConfig = await config.load();

    if (ariaConfig.runtime.env) {
      for (const [envVar, value] of Object.entries(ariaConfig.runtime.env)) {
        if (!process.env[envVar] && value) {
          process.env[envVar] = value;
        }
      }
    }
  }

  const secrets = await loadSecrets(homeDir);
  if (secrets?.apiKeys) {
    for (const [envVar, value] of Object.entries(secrets.apiKeys)) {
      if (!process.env[envVar] && value) {
        process.env[envVar] = value;
      }
    }
  }

  // Preserve compatibility with older vaults that stored the Telegram token
  // in the legacy top-level field instead of apiKeys.TELEGRAM_BOT_TOKEN.
  if (!process.env.TELEGRAM_BOT_TOKEN && secrets?.botToken) {
    process.env.TELEGRAM_BOT_TOKEN = secrets.botToken;
  }

  if (!process.env.ARIA_TELEGRAM_PAIRING_CODE && secrets?.pairingCode) {
    process.env.ARIA_TELEGRAM_PAIRING_CODE = secrets.pairingCode;
  }
}
