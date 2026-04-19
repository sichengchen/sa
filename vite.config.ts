import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const tsconfig = JSON.parse(readFileSync(new URL("./tsconfig.json", import.meta.url), "utf-8")) as {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};
const ignoredPaths = [
  ".agents/**",
  ".codex/**",
  "dist/**",
  "out/**",
  "node_modules/**",
  "**/*.generated.ts",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const workspaceAliases = Object.entries(tsconfig.compilerOptions?.paths ?? {}).flatMap(
  ([key, targets]) => {
    const target = targets[0];
    if (!target) {
      return [];
    }

    if (key.endsWith("/*") && target.endsWith("/*")) {
      const sourceBase = key.slice(0, -2);
      const targetBase = resolve(rootDir, target.slice(0, -2));

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
        replacement: resolve(rootDir, target),
      },
    ];
  },
);

export default defineConfig({
  resolve: {
    alias: [
      ...workspaceAliases,
      {
        find: /^bun:test$/,
        replacement: resolve(rootDir, "tests/vitest-bun-test-shim.ts"),
      },
    ],
  },
  fmt: {
    ignorePatterns: ignoredPaths,
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: ignoredPaths,
    options: {
      typeAware: false,
      typeCheck: false,
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    passWithNoTests: false,
    setupFiles: ["tests/vitest-setup.ts"],
  },
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
    tasks: {
      "repo:prepare-skills": {
        command: "bun scripts/copy-docs.ts && bun run scripts/embed-skills.ts",
        input: [
          { auto: true },
          { pattern: "docs/**", base: "workspace" },
          { pattern: "scripts/copy-docs.ts", base: "workspace" },
          { pattern: "scripts/embed-skills.ts", base: "workspace" },
        ],
      },
      "repo:check": {
        command: "vp check && tsc --noEmit",
        input: [
          { auto: true },
          { pattern: "vite.config.ts", base: "workspace" },
          { pattern: "tsconfig.json", base: "workspace" },
        ],
      },
      "repo:test": {
        command: "bunx --bun vitest run --config vite.config.ts",
        input: [
          { auto: true },
          { pattern: "vite.config.ts", base: "workspace" },
          { pattern: "tsconfig.json", base: "workspace" },
          { pattern: "tests/**", base: "workspace" },
        ],
      },
      "repo:test:watch": {
        command: "bunx --bun vitest --config vite.config.ts",
        cache: false,
      },
      "repo:build": {
        command: "vp run repo:prepare-skills && vp pack && bun run --cwd apps/aria-desktop build",
        input: [
          { auto: true },
          { pattern: "apps/aria-desktop/**", base: "workspace" },
          { pattern: "packages/**", base: "workspace" },
          { pattern: "docs/**", base: "workspace" },
          { pattern: "bun.lock", base: "workspace" },
          { pattern: "package.json", base: "workspace" },
          { pattern: "scripts/**", base: "workspace" },
          { pattern: "vite.config.ts", base: "workspace" },
          { pattern: "tsconfig.json", base: "workspace" },
        ],
      },
      "repo:verify": {
        command: "vp run repo:check && vp run repo:test && vp run repo:build",
      },
    },
  },
  pack: {
    entry: ["packages/cli/src/index.ts"],
    outDir: "dist",
    format: ["esm"],
    platform: "node",
    deps: {
      neverBundle: ["bun", "bun:sqlite"],
    },
    target: "es2022",
    clean: true,
    dts: false,
    sourcemap: false,
  },
});
