import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDED_SKILLS } from "./embedded-skills.generated.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BUNDLED_SKILLS_DIR = resolve(__dirname, "./bundled");
export { EMBEDDED_SKILLS };
