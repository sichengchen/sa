import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const tsconfig = JSON.parse(
  readFileSync(new URL("../../tsconfig.json", import.meta.url), "utf-8"),
) as {
  compilerOptions?: { paths?: Record<string, string[]> };
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const aliases = Object.entries(tsconfig.compilerOptions?.paths ?? {}).flatMap(([key, targets]) => {
  const target = targets[0];
  if (!target) return [];

  if (key.endsWith("/*") && target.endsWith("/*")) {
    const sourceBase = key.slice(0, -2);
    const targetBase = resolve(workspaceRoot, target.slice(0, -2));
    return [
      {
        find: new RegExp(`^${escapeRegex(sourceBase)}/(.*?)(?:\\.js)?$`),
        replacement: `${targetBase}/$1`,
      },
    ];
  }

  return [
    {
      find: new RegExp(`^${escapeRegex(key)}(?:\\.js)?$`),
      replacement: resolve(workspaceRoot, target),
    },
  ];
});

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: aliases,
  },
  build: {
    outDir: resolve(rootDir, "dist", "renderer"),
    emptyOutDir: false,
  },
});
