import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SkillMetadata } from "./types.js";

const embeddedContentCache = new Map<string, string>();

function parseFrontmatter(content: string): {
  meta: Record<string, string>;
  body: string;
} {
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

export async function scanSkillDirectory(dir: string): Promise<SkillMetadata[]> {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const skills: SkillMetadata[] = [];
  for (const entry of entries) {
    const skillDir = join(dir, entry);
    const skillFile = join(skillDir, "SKILL.md");

    try {
      const fileStat = await stat(skillDir);
      if (!fileStat.isDirectory()) continue;
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
    } catch (error) {
      console.warn(`Failed to load skill at ${skillFile}:`, error);
    }
  }

  return skills;
}

export function parseEmbeddedSkills(
  embedded: Record<string, Record<string, string>>,
): SkillMetadata[] {
  const skills: SkillMetadata[] = [];

  for (const [dirName, files] of Object.entries(embedded)) {
    const skillContent = files["SKILL.md"];
    if (!skillContent) continue;

    const { meta, body } = parseFrontmatter(skillContent);
    if (!meta.name || !meta.description) continue;

    const filePath = `embedded:${dirName}/SKILL.md`;
    embeddedContentCache.set(filePath, body);

    for (const [relPath, content] of Object.entries(files)) {
      if (relPath === "SKILL.md") continue;
      embeddedContentCache.set(`embedded:${dirName}/${relPath}`, content);
    }

    skills.push({
      name: meta.name,
      description: meta.description,
      filePath,
    });
  }

  return skills;
}

export async function loadSkillContent(filePath: string): Promise<string> {
  const cached = embeddedContentCache.get(filePath);
  if (cached !== undefined) return cached;

  const content = await readFile(filePath, "utf-8");
  const { body } = parseFrontmatter(content);
  return body;
}

export function loadEmbeddedDoc(skillName: string, relativePath: string): string | undefined {
  return embeddedContentCache.get(`embedded:${skillName}/${relativePath}`);
}

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

export { parseFrontmatter };
