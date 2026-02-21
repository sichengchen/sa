import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { scanSkillDirectory, loadSkillContent } from "./loader.js";
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

    // Scan bundled skills first, then user skills (user overrides bundled on name collision)
    const bundled = await scanSkillDirectory(BUNDLED_SKILLS_DIR);
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

  /** Total number of discovered skills */
  get size(): number {
    return this.skills.size;
  }
}
