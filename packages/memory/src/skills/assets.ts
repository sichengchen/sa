import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDED_SKILLS } from "./embedded-skills.generated.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "..", "..", "..", "..");

export const BUNDLED_SKILLS_DIR = resolve(
  workspaceRoot,
  "packages",
  "runtime",
  "src",
  "skills",
  "bundled",
);
export { EMBEDDED_SKILLS };
