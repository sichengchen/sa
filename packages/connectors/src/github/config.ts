/** Required env vars for GitHub connector */
export const GITHUB_REQUIRED_ENV = ["GITHUB_TOKEN", "GITHUB_WEBHOOK_SECRET"] as const;

export function hasGitHubCredentials(): boolean {
  return GITHUB_REQUIRED_ENV.every((key) => !!process.env[key]);
}

export function getMissingCredentials(): string[] {
  return GITHUB_REQUIRED_ENV.filter((key) => !process.env[key]);
}
