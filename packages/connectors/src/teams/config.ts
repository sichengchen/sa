/** Required env vars for Teams connector */
export const TEAMS_REQUIRED_ENV = ["TEAMS_BOT_ID", "TEAMS_BOT_PASSWORD"] as const;

export function hasTeamsCredentials(): boolean {
  return TEAMS_REQUIRED_ENV.every((key) => !!process.env[key]);
}

export function getMissingCredentials(): string[] {
  return TEAMS_REQUIRED_ENV.filter((key) => !process.env[key]);
}
