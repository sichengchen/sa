/**
 * Slack connector configuration.
 *
 * Chat SDK auto-detects credentials from env vars.
 * Esperta Aria stores them in secrets.enc via set_env_secret.
 */

/** Required env vars for Slack webhook mode */
export const SLACK_WEBHOOK_REQUIRED_ENV = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"] as const;

/** Additional env vars required for Slack Socket Mode */
export const SLACK_SOCKET_MODE_REQUIRED_ENV = [
  ...SLACK_WEBHOOK_REQUIRED_ENV,
  "SLACK_APP_TOKEN",
] as const;

/** Check if Slack webhook credentials are available */
export function hasSlackCredentials(): boolean {
  return SLACK_WEBHOOK_REQUIRED_ENV.every((key) => !!process.env[key]);
}

/** Get missing Slack webhook credentials */
export function getMissingCredentials(): string[] {
  return SLACK_WEBHOOK_REQUIRED_ENV.filter((key) => !process.env[key]);
}

/** Check if Slack Socket Mode credentials are available */
export function hasSlackSocketModeCredentials(): boolean {
  return SLACK_SOCKET_MODE_REQUIRED_ENV.every((key) => !!process.env[key]);
}

/** Get missing Slack Socket Mode credentials */
export function getMissingSocketModeCredentials(): string[] {
  return SLACK_SOCKET_MODE_REQUIRED_ENV.filter((key) => !process.env[key]);
}
