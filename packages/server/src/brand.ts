import { homedir } from "node:os";
import { join } from "node:path";

export const PRODUCT_NAME = "Esperta Aria";
export const RUNTIME_NAME = "Aria Runtime";
export const CLI_NAME = "aria";
export const HOME_ENV_VAR = "ARIA_HOME";
export const HOME_DIR_NAME = ".aria";
export const HOME_PLACEHOLDER = "[ARIA_HOME]";
export const ENGINE_PORT_ENV_VAR = "ARIA_ENGINE_PORT";

export function getRuntimeHome(): string {
  return process.env[HOME_ENV_VAR] ?? join(homedir(), HOME_DIR_NAME);
}
