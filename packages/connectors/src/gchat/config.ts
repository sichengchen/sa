/** Required env vars for Google Chat connector */
export const GCHAT_REQUIRED_ENV = ["GOOGLE_CHAT_SERVICE_ACCOUNT_KEY"] as const;

export function hasGChatCredentials(): boolean {
  return GCHAT_REQUIRED_ENV.every((key) => !!process.env[key]);
}

export function getMissingCredentials(): string[] {
  return GCHAT_REQUIRED_ENV.filter((key) => !process.env[key]);
}
