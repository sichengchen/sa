import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { InstalledSkillEntry } from "./types.js";
import { ClawHubClient } from "./client.js";

const REGISTRY_FILE = ".registry.json";

/** Install and manage skills from ClawHub */
export class SkillInstaller {
  private readonly skillsDir: string;
  private readonly client: ClawHubClient;

  constructor(saHome: string, client?: ClawHubClient) {
    this.skillsDir = join(saHome, "skills");
    this.client = client ?? new ClawHubClient();
  }

  /** Download and install a skill from ClawHub */
  async install(slug: string, version?: string): Promise<{ name: string; path: string }> {
    // Fetch skill detail to get name
    const detail = await this.client.getSkill(slug);
    const name = detail.name;

    // Check for conflicts with existing skills
    const targetDir = join(this.skillsDir, name);
    const existingSkills = await this.listDirectories();
    if (existingSkills.includes(name)) {
      const registry = await this.readRegistry();
      const existing = registry.find((e) => e.name === name);
      if (existing && existing.slug !== slug) {
        throw new Error(
          `Name conflict: "${name}" is already installed from "${existing.slug}". Uninstall it first.`,
        );
      }
      // Same slug = update — proceed to overwrite
    }

    // Download the skill zip
    const zipBuffer = await this.client.download(slug, version ?? detail.version);

    // Extract to target directory
    await this.extractZip(Buffer.from(zipBuffer), targetDir);

    // Validate extracted SKILL.md exists
    const skillFile = join(targetDir, "SKILL.md");
    if (!existsSync(skillFile)) {
      throw new Error(`Invalid skill package: missing SKILL.md in "${slug}"`);
    }

    // Update local registry
    await this.updateRegistry({
      slug,
      name,
      version: version ?? detail.version,
      installedAt: new Date().toISOString(),
    });

    return { name, path: targetDir };
  }

  /** Uninstall a skill by name */
  async uninstall(name: string): Promise<boolean> {
    const targetDir = join(this.skillsDir, name);
    if (!existsSync(targetDir)) return false;

    const { rm } = await import("node:fs/promises");
    await rm(targetDir, { recursive: true, force: true });

    // Remove from registry
    const registry = await this.readRegistry();
    const filtered = registry.filter((e) => e.name !== name);
    await this.writeRegistry(filtered);

    return true;
  }

  /** List installed skills from the local registry */
  async listInstalled(): Promise<InstalledSkillEntry[]> {
    return this.readRegistry();
  }

  // --- internal ---

  private async extractZip(buffer: Buffer, targetDir: string): Promise<void> {
    await mkdir(targetDir, { recursive: true });

    // Bun has built-in zip support via Bun.file / decompress
    // Use the JSZip-compatible approach with Bun's native unzip
    const tempZip = join(this.skillsDir, `.tmp-${Date.now()}.zip`);
    try {
      await writeFile(tempZip, buffer);
      // Use Bun's native shell for unzip
      const proc = Bun.spawn(["unzip", "-o", tempZip, "-d", targetDir], {
        stdout: "ignore",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Failed to extract zip: ${stderr}`);
      }
    } finally {
      // Clean up temp file
      try {
        const { rm } = await import("node:fs/promises");
        await rm(tempZip, { force: true });
      } catch { /* ignore cleanup errors */ }
    }
  }

  private async listDirectories(): Promise<string[]> {
    if (!existsSync(this.skillsDir)) return [];
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  private async readRegistry(): Promise<InstalledSkillEntry[]> {
    const registryPath = join(this.skillsDir, REGISTRY_FILE);
    if (!existsSync(registryPath)) return [];
    try {
      const data = await readFile(registryPath, "utf-8");
      return JSON.parse(data) as InstalledSkillEntry[];
    } catch {
      return [];
    }
  }

  private async writeRegistry(entries: InstalledSkillEntry[]): Promise<void> {
    await mkdir(this.skillsDir, { recursive: true });
    const registryPath = join(this.skillsDir, REGISTRY_FILE);
    await writeFile(registryPath, JSON.stringify(entries, null, 2) + "\n");
  }

  private async updateRegistry(entry: InstalledSkillEntry): Promise<void> {
    const registry = await this.readRegistry();
    const idx = registry.findIndex((e) => e.slug === entry.slug);
    if (idx >= 0) {
      registry[idx] = entry;
    } else {
      registry.push(entry);
    }
    await this.writeRegistry(registry);
  }
}
