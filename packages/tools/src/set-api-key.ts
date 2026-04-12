import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";
import type { ConfigManager } from "@aria/runtime/config";

/** Environment variables that must not be overwritten by the agent (injection risk). */
const BLOCKED_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "PATH",
  "PYTHONPATH",
  "RUBYOPT",
]);

/**
 * Validates an environment variable name.
 * Returns an error string if invalid, or null if the name is acceptable.
 */
export function validateEnvVarName(name: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return "Error: variable name must contain only letters, digits, and underscores";
  }
  if (BLOCKED_ENV_VARS.has(name.toUpperCase())) {
    return `Error: setting ${name} is not permitted for security reasons`;
  }
  return null;
}

/** Create a set_env_secret tool — stores values encrypted in secrets.enc */
export function createSetEnvSecretTool(config: ConfigManager): ToolImpl {
  return {
    name: "set_env_secret",
    description:
      "Store a sensitive value (API key, token, password) in Aria's encrypted vault (secrets.enc). " +
      "The value is injected as an environment variable immediately and persists across restarts.",
    summary:
      "Store a secret (API key, token) encrypted in secrets.enc. " +
      "Use for: BRAVE_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, bot tokens, etc.",
    dangerLevel: "safe",
    parameters: Type.Object({
      name: Type.String({
        description: 'Environment variable name, e.g. "BRAVE_API_KEY"',
      }),
      value: Type.String({ description: "The secret value" }),
    }),
    async execute(args) {
      const name = args.name as string;
      const value = args.value as string;

      if (!name.trim() || !value.trim()) {
        return { content: "Error: name and value must not be empty", isError: true };
      }

      const nameError = validateEnvVarName(name);
      if (nameError) return { content: nameError, isError: true };

      try {
        const secrets = (await config.loadSecrets()) ?? { apiKeys: {} };
        secrets.apiKeys[name] = value;
        await config.saveSecrets(secrets);
        process.env[name] = value;

        return {
          content: `Stored ${name} in encrypted vault. Active now.`,
          isError: false,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error: ${msg}`, isError: true };
      }
    },
  };
}

/** Create a set_env_variable tool — stores values in plain config.json */
export function createSetEnvVariableTool(config: ConfigManager): ToolImpl {
  return {
    name: "set_env_variable",
    description:
      "Set a non-sensitive environment variable in Aria's config (config.json runtime.env). " +
      "The value is injected immediately and persists across restarts. " +
      "Do NOT use for secrets — use set_env_secret instead.",
    summary:
      "Set a plain (non-secret) environment variable in config.json. " +
      "Use for: feature flags, paths, non-sensitive config. Not for API keys or tokens.",
    dangerLevel: "safe",
    parameters: Type.Object({
      name: Type.String({
        description: 'Environment variable name, e.g. "ARIA_LOG_LEVEL"',
      }),
      value: Type.String({ description: "The value to set" }),
    }),
    async execute(args) {
      const name = args.name as string;
      const value = args.value as string;

      if (!name.trim()) {
        return { content: "Error: name must not be empty", isError: true };
      }

      const nameError = validateEnvVarName(name);
      if (nameError) return { content: nameError, isError: true };

      try {
        const configFile = config.getConfigFile();
        const env = configFile.runtime.env ?? {};
        env[name] = value;
        await config.saveConfig({ ...configFile, runtime: { ...configFile.runtime, env } });
        process.env[name] = value;

        return {
          content: `Set ${name} in config. Active now.`,
          isError: false,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error: ${msg}`, isError: true };
      }
    },
  };
}
