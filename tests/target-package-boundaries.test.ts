import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET_ENTRYPOINT_PACKAGE_DIRS = [
  "packages/access-client/src",
  "packages/agents-coding/src",
  "packages/connectors-im/src",
  "packages/console/src",
  "packages/handoff/src",
  "packages/jobs/src",
  "packages/memory/src",
  "packages/automation/src",
  "packages/policy/src",
  "packages/prompt/src",
  "packages/projects/src",
  "packages/protocol/src",
  "packages/server/src",
  "packages/workspaces/src",
] as const;
const THIN_SHELL_DIRS = ["apps/aria-server/src"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SIBLING_PACKAGE_SRC_IMPORT = /\.\.\/\.\.\/[^/]+\/src\//;

async function listFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = join(ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        return listFiles(relativePath);
      }
      if (!SOURCE_EXTENSIONS.has(extname(entry.name))) {
        return [];
      }
      return [relativePath];
    }),
  );
  return files.flat();
}

describe("target package boundary audit", () => {
  test("target package entrypoints consume package imports instead of sibling src internals", async () => {
    const offenders: string[] = [];

    for (const relativeDir of TARGET_ENTRYPOINT_PACKAGE_DIRS) {
      for (const relativePath of await listFiles(relativeDir)) {
        const source = await readFile(join(ROOT, relativePath), "utf-8");
        if (SIBLING_PACKAGE_SRC_IMPORT.test(source)) {
          offenders.push(relativePath);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("thin target shells avoid sibling package src internals", async () => {
    const offenders: string[] = [];

    for (const relativeDir of THIN_SHELL_DIRS) {
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
