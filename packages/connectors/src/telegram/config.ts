/** Required env vars for Telegram connector (Chat SDK version) */
export const TELEGRAM_REQUIRED_ENV = ["TELEGRAM_BOT_TOKEN"] as const;

export function hasTelegramCredentials(): boolean {
  return TELEGRAM_REQUIRED_ENV.every((key) => !!process.env[key]);
}

export function getMissingCredentials(): string[] {
  return TELEGRAM_REQUIRED_ENV.filter((key) => !process.env[key]);
}
