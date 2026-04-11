/** Required env vars for Discord connector (Chat SDK version) */
export const DISCORD_REQUIRED_ENV = ["DISCORD_BOT_TOKEN", "DISCORD_PUBLIC_KEY"] as const;

export function hasDiscordCredentials(): boolean {
  return DISCORD_REQUIRED_ENV.every((key) => !!process.env[key]);
}

export function getMissingCredentials(): string[] {
  return DISCORD_REQUIRED_ENV.filter((key) => !process.env[key]);
}
