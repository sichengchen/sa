import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const TARGET_OWNED_PACKAGE_DIRS = [
  "packages/desktop-bridge/src",
  "packages/desktop-git/src",
  "packages/jobs/src",
  "packages/automation/src",
  "packages/policy/src",
  "packages/prompt/src",
  "packages/projects/src",
  "packages/workspaces/src",
] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SIBLING_PACKAGE_SRC_IMPORT = /\.\.\/\.\.\/[^/]+\/src\//;

async function listFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = join(ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      return listFiles(relativePath);
    }
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) {
      return [];
    }
    return [relativePath];
  }));
  return files.flat();
}

describe("target package boundary audit", () => {
  test("desktop/project target-owned packages consume package entrypoints instead of sibling src internals", async () => {
    const offenders: string[] = [];

    for (const relativeDir of TARGET_OWNED_PACKAGE_DIRS) {
      for (const relativePath of await listFiles(relativeDir)) {
        const source = await readFile(join(ROOT, relativePath), "utf-8");
        if (SIBLING_PACKAGE_SRC_IMPORT.test(source)) {
          offenders.push(relativePath);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
