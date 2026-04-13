import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { isPathInside } from "@aria/policy/path-boundary";
import { getRuntimeHome } from "@aria/server/brand";
import { BUNDLED_SKILLS_DIR, EMBEDDED_SKILLS } from "./assets.js";
import {
  listEmbeddedFiles,
  loadEmbeddedDoc,
  loadSkillContent,
  parseEmbeddedSkills,
  scanSkillDirectory,
} from "./loader.js";
import type { LoadedSkill, SkillMetadata } from "./types.js";

export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>();

  async loadAll(runtimeHome?: string): Promise<void> {
    this.skills.clear();
    const home = runtimeHome ?? getRuntimeHome();
    const skillsDir = join(home, "skills");

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

  getMetadataList(): SkillMetadata[] {
    return Array.from(this.skills.values()).map(({ name, description, filePath }) => ({
      name,
      description,
      filePath,
    }));
  }

  async activate(name: string): Promise<boolean> {
    const skill = this.skills.get(name);
    if (!skill) return false;

    if (!skill.content) {
      skill.content = await loadSkillContent(skill.filePath);
    }
    skill.active = true;
    return true;
  }

  deactivate(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.active = false;
    return true;
  }

  async getContent(name: string): Promise<string | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;

    if (!skill.content) {
      skill.content = await loadSkillContent(skill.filePath);
    }
    const baseDir = dirname(skill.filePath);
    return skill.content.replace(/\{baseDir\}/g, baseDir);
  }

  isActive(name: string): boolean {
    return this.skills.get(name)?.active ?? false;
  }

  getActiveSkills(): LoadedSkill[] {
    return Array.from(this.skills.values()).filter((skill) => skill.active);
  }

  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  async getSubFile(name: string, relativePath: string): Promise<string | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;

    if (skill.filePath.startsWith("embedded:")) {
      return loadEmbeddedDoc(name, relativePath) ?? null;
    }

    const skillDir = dirname(skill.filePath);
    const target = resolve(skillDir, relativePath);
    if (!isPathInside(skillDir, target)) return null;

    try {
      return await readFile(target, "utf-8");
    } catch {
      return null;
    }
  }

  async listFiles(name: string): Promise<string[]> {
    const skill = this.skills.get(name);
    if (!skill) return [];

    if (skill.filePath.startsWith("embedded:")) {
      return listEmbeddedFiles(name);
    }

    const skillDir = dirname(skill.filePath);
    return this.scanDir(skillDir, skillDir);
  }

  private async scanDir(dir: string, baseDir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        const fileStat = await stat(full);
        if (fileStat.isDirectory()) {
          results.push(...(await this.scanDir(full, baseDir)));
        } else if (entry.endsWith(".md")) {
          results.push(full.slice(baseDir.length + 1));
        }
      }
    } catch {
      // directory missing or unreadable
    }
    return results.sort();
  }

  get size(): number {
    return this.skills.size;
  }
}
