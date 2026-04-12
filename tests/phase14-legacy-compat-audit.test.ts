import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_DIRS = ["apps", "packages", "services", "scripts"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const LEGACY_IMPORT_PATTERNS = [
  /@aria\/projects-engine(?:\/|["'])/,
  /@aria\/providers-(?:aria|codex|claude-code|opencode)(?:\/|["'])/,
  /@aria\/shared-types(?:\/|["'])/,
  /@aria\/shared\//,
  /@aria\/connectors\//,
];

const EXCLUDED_PREFIXES = [
  "packages/projects-engine/",
  "packages/providers-aria/",
  "packages/providers-codex/",
  "packages/providers-claude-code/",
  "packages/providers-opencode/",
  "packages/shared-types/",
  "packages/connectors/",
  "packages/runtime/src/skills/",
  "scripts/migrate-legacy-esperta-code.ts",
];

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

async function collectSourceFiles(): Promise<string[]> {
  const files = (await Promise.all(SOURCE_DIRS.map((dir) => listFiles(dir)))).flat();
  return files.filter((file) => !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

describe("Phase 14 legacy compatibility audit", () => {
  test("production code no longer imports legacy compatibility package paths directly", async () => {
    const sourceFiles = await collectSourceFiles();
    const offenders: string[] = [];

    for (const relativePath of sourceFiles) {
      const source = await readFile(join(ROOT, relativePath), "utf-8");
      if (LEGACY_IMPORT_PATTERNS.some((pattern) => pattern.test(source))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
