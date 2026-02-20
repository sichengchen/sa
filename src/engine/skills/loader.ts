import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { SkillMetadata } from "./types.js";

/** Parse YAML-like frontmatter from a SKILL.md file */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) {
      meta[key] = value;
    }
  }

  return { meta, body: match[2]!.trim() };
}

/** Scan a directory for skill folders containing SKILL.md */
export async function scanSkillDirectory(dir: string): Promise<SkillMetadata[]> {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const skills: SkillMetadata[] = [];

  for (const entry of entries) {
    const skillDir = join(dir, entry);
    const skillFile = join(skillDir, "SKILL.md");

    // Check if it's a directory with SKILL.md
    try {
      const s = await stat(skillDir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    if (!existsSync(skillFile)) continue;

    try {
      const content = await readFile(skillFile, "utf-8");
      const { meta } = parseFrontmatter(content);

      if (!meta.name || !meta.description) {
        console.warn(`Skipping skill at ${skillFile}: missing name or description in frontmatter`);
        continue;
      }

      skills.push({
        name: meta.name,
        description: meta.description,
        filePath: skillFile,
      });
    } catch (err) {
      console.warn(`Failed to load skill at ${skillFile}:`, err);
    }
  }

  return skills;
}

/** Load the full content (body) of a SKILL.md file */
export async function loadSkillContent(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  const { body } = parseFrontmatter(content);
  return body;
}

// Export for testing
export { parseFrontmatter };
