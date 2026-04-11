/** Required env vars for Linear connector */
export const LINEAR_REQUIRED_ENV = ["LINEAR_API_KEY", "LINEAR_WEBHOOK_SECRET"] as const;

export function hasLinearCredentials(): boolean {
  return LINEAR_REQUIRED_ENV.every((key) => !!process.env[key]);
}

export function getMissingCredentials(): string[] {
  return LINEAR_REQUIRED_ENV.filter((key) => !process.env[key]);
}
