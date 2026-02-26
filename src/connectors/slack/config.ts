/**
 * Slack connector configuration.
 *
 * Chat SDK auto-detects credentials from env vars.
 * SA stores them in secrets.enc via set_env_secret.
 */

/** Required env vars for Slack connector */
export const SLACK_REQUIRED_ENV = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"] as const;

/** Optional env vars */
export const SLACK_OPTIONAL_ENV = ["SLACK_APP_TOKEN"] as const;

/** Check if Slack credentials are available */
export function hasSlackCredentials(): boolean {
  return SLACK_REQUIRED_ENV.every((key) => !!process.env[key]);
}

/** Get missing Slack credentials */
export function getMissingCredentials(): string[] {
  return SLACK_REQUIRED_ENV.filter((key) => !process.env[key]);
}
