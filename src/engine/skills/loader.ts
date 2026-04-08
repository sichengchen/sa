import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { SkillMetadata } from "./types.js";

/**
 * In-memory cache for embedded skill content.
 * Keys are "embedded:<skillName>/<relativePath>" (e.g. "embedded:aria/SKILL.md").
 * Values are file content (full content for non-SKILL.md, body-only for SKILL.md).
 */
const embeddedContentCache = new Map<string, string>();

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

/** Parse embedded skill content into SkillMetadata (for single-binary builds) */
export function parseEmbeddedSkills(embedded: Record<string, Record<string, string>>): SkillMetadata[] {
  const skills: SkillMetadata[] = [];

  for (const [dirName, files] of Object.entries(embedded)) {
    // SKILL.md is required for metadata
    const skillContent = files["SKILL.md"];
    if (!skillContent) continue;

    const { meta, body } = parseFrontmatter(skillContent);
    if (!meta.name || !meta.description) continue;

    const filePath = `embedded:${dirName}/SKILL.md`;
    embeddedContentCache.set(filePath, body);

    // Cache all other .md files in this skill directory
    for (const [relPath, content] of Object.entries(files)) {
      if (relPath === "SKILL.md") continue;
      const embeddedPath = `embedded:${dirName}/${relPath}`;
      embeddedContentCache.set(embeddedPath, content);
    }

    skills.push({
      name: meta.name,
      description: meta.description,
      filePath,
    });
  }

  return skills;
}

/** Load the full content (body) of a SKILL.md file */
export async function loadSkillContent(filePath: string): Promise<string> {
  // Check embedded cache first (for single-binary builds)
  const cached = embeddedContentCache.get(filePath);
  if (cached !== undefined) return cached;

  const content = await readFile(filePath, "utf-8");
  const { body } = parseFrontmatter(content);
  return body;
}

/**
 * Load an embedded doc file by skill name and relative path.
 * Used by the `read` tool to access skill docs in binary builds.
 * Returns undefined if not found in the embedded cache.
 */
export function loadEmbeddedDoc(skillName: string, relativePath: string): string | undefined {
  const key = `embedded:${skillName}/${relativePath}`;
  return embeddedContentCache.get(key);
}

/**
 * List all embedded file paths for a given skill.
 * Returns relative paths (e.g. ["SKILL.md", "docs/architecture.md", ...]).
 */
export function listEmbeddedFiles(skillName: string): string[] {
  const prefix = `embedded:${skillName}/`;
  const paths: string[] = [];
  for (const key of embeddedContentCache.keys()) {
    if (key.startsWith(prefix)) {
      paths.push(key.slice(prefix.length));
    }
  }
  return paths.sort();
}

// Export for testing
export { parseFrontmatter };
