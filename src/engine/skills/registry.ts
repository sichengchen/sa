import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { scanSkillDirectory, loadSkillContent, parseEmbeddedSkills, loadEmbeddedDoc, listEmbeddedFiles } from "./loader.js";
import { EMBEDDED_SKILLS } from "./embedded-skills.generated.js";
import type { SkillMetadata, LoadedSkill } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BUNDLED_SKILLS_DIR = join(__dirname, "bundled");

/** Central registry for discovered and activated skills */
export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>();

  /** Scan all skill directories and register metadata */
  async loadAll(saHome?: string): Promise<void> {
    this.skills.clear();
    const home = saHome ?? process.env.SA_HOME ?? join(homedir(), ".sa");
    const skillsDir = join(home, "skills");

    // Scan bundled skills — filesystem first, embedded fallback for single-binary builds
    const bundled = existsSync(BUNDLED_SKILLS_DIR)
      ? await scanSkillDirectory(BUNDLED_SKILLS_DIR)
      : parseEmbeddedSkills(EMBEDDED_SKILLS);
    const userSkills = await scanSkillDirectory(skillsDir);

    for (const meta of [...bundled, ...userSkills]) {
      this.skills.set(meta.name, {
        ...meta,
        content: "",
        active: false,
      });
    }
  }

  /** Get metadata list for all discovered skills */
  getMetadataList(): SkillMetadata[] {
    return Array.from(this.skills.values()).map(({ name, description, filePath }) => ({
      name,
      description,
      filePath,
    }));
  }

  /** Activate a skill — lazy-load its full content */
  async activate(name: string): Promise<boolean> {
    const skill = this.skills.get(name);
    if (!skill) return false;

    if (!skill.content) {
      skill.content = await loadSkillContent(skill.filePath);
    }
    skill.active = true;
    return true;
  }

  /** Deactivate a skill */
  deactivate(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.active = false;
    return true;
  }

  /** Get full content of a skill (loads if needed) */
  async getContent(name: string): Promise<string | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;

    if (!skill.content) {
      skill.content = await loadSkillContent(skill.filePath);
    }
    // Interpolate {baseDir} with the skill's actual directory path
    const baseDir = dirname(skill.filePath);
    return skill.content.replace(/\{baseDir\}/g, baseDir);
  }

  /** Check if a skill is active */
  isActive(name: string): boolean {
    return this.skills.get(name)?.active ?? false;
  }

  /** Get all active skills */
  getActiveSkills(): LoadedSkill[] {
    return Array.from(this.skills.values()).filter((s) => s.active);
  }

  /** Get a skill by name */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  /** Load a sub-file from a skill directory by relative path */
  async getSubFile(name: string, relativePath: string): Promise<string | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;

    if (skill.filePath.startsWith("embedded:")) {
      // Embedded mode — look up in cache
      const content = loadEmbeddedDoc(name, relativePath);
      return content ?? null;
    }

    // Filesystem mode — resolve relative to skill directory
    const skillDir = dirname(skill.filePath);
    const target = resolve(skillDir, relativePath);

    // Traversal guard: target must be within the skill directory
    if (!target.startsWith(skillDir)) return null;

    try {
      return await readFile(target, "utf-8");
    } catch {
      return null;
    }
  }

  /** List all files in a skill directory (relative paths) */
  async listFiles(name: string): Promise<string[]> {
    const skill = this.skills.get(name);
    if (!skill) return [];

    if (skill.filePath.startsWith("embedded:")) {
      return listEmbeddedFiles(name);
    }

    // Filesystem mode — recursive scan for .md files
    const skillDir = dirname(skill.filePath);
    return this.scanDir(skillDir, skillDir);
  }

  /** Recursively scan a directory for .md files, returning relative paths */
  private async scanDir(dir: string, baseDir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        const s = await stat(full);
        if (s.isDirectory()) {
          results.push(...(await this.scanDir(full, baseDir)));
        } else if (entry.endsWith(".md")) {
          const rel = full.slice(baseDir.length + 1); // strip baseDir + separator
          results.push(rel);
        }
      }
    } catch {
      // dir doesn't exist or unreadable
    }
    return results.sort();
  }

  /** Total number of discovered skills */
  get size(): number {
    return this.skills.size;
  }
}
