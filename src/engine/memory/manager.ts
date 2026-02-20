import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { MemoryEntry } from "./types.js";

const MAX_MEMORY_LINES = 200;

export class MemoryManager {
  private memoryDir: string;
  private topicsDir: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
    this.topicsDir = join(memoryDir, "topics");
  }

  async init(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await mkdir(this.topicsDir, { recursive: true });

    const mainPath = join(this.memoryDir, "MEMORY.md");
    if (!existsSync(mainPath)) {
      await writeFile(mainPath, "");
    }
  }

  /** Load MEMORY.md content for system prompt injection (truncated to MAX_MEMORY_LINES) */
  async loadContext(): Promise<string> {
    const mainPath = join(this.memoryDir, "MEMORY.md");
    if (!existsSync(mainPath)) return "";

    const content = await readFile(mainPath, "utf-8");
    const lines = content.split("\n");
    if (lines.length > MAX_MEMORY_LINES) {
      return lines.slice(0, MAX_MEMORY_LINES).join("\n") + "\n...(truncated)";
    }
    return content;
  }

  /** Save or update a memory entry. Writes to topics/<key>.md */
  async save(key: string, content: string): Promise<void> {
    const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(this.topicsDir, `${safeName}.md`);
    await writeFile(filePath, content);
  }

  /** Search across all memory files for a keyword */
  async search(query: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const lowerQuery = query.toLowerCase();

    // Search MEMORY.md
    const mainPath = join(this.memoryDir, "MEMORY.md");
    if (existsSync(mainPath)) {
      const content = await readFile(mainPath, "utf-8");
      if (content.toLowerCase().includes(lowerQuery)) {
        results.push({
          key: "MEMORY",
          content,
          updatedAt: 0,
        });
      }
    }

    // Search topic files
    if (!existsSync(this.topicsDir)) return results;
    const files = await readdir(this.topicsDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(this.topicsDir, file);
      const content = await readFile(filePath, "utf-8");
      if (content.toLowerCase().includes(lowerQuery)) {
        results.push({
          key: file.replace(/\.md$/, ""),
          content,
          updatedAt: 0,
        });
      }
    }

    return results;
  }

  /** List all memory entries (keys only) */
  async list(): Promise<string[]> {
    const keys: string[] = [];
    if (!existsSync(this.topicsDir)) return keys;
    const files = await readdir(this.topicsDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        keys.push(file.replace(/\.md$/, ""));
      }
    }
    return keys;
  }

  /** Delete a memory entry by key */
  async delete(key: string): Promise<boolean> {
    const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(this.topicsDir, `${safeName}.md`);
    if (!existsSync(filePath)) return false;
    await unlink(filePath);
    return true;
  }

  /** Read a specific memory entry */
  async get(key: string): Promise<string | null> {
    const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(this.topicsDir, `${safeName}.md`);
    if (!existsSync(filePath)) return null;
    return readFile(filePath, "utf-8");
  }
}
