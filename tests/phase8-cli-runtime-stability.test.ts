import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readRepoFile(relativePath: string): string {
  return readFileSync(join(import.meta.dir, "..", relativePath), "utf-8");
}

function readRepoJson<T>(relativePath: string): T {
  return JSON.parse(readRepoFile(relativePath)) as T;
}

const futureClientShellSeams = ["@aria/desktop", "@aria/mobile", "packages/desktop", "packages/mobile"];
const currentBootstrapFiles = [
  "package.json",
  "packages/cli/src/index.ts",
  "packages/cli/src/engine.ts",
  "packages/runtime/src/engine.ts",
  "packages/server/src/app.ts",
  "packages/server/src/engine.ts",
  "apps/aria-server/src/index.ts",
] as const;

const futureClientPackages = [
  {
    packageName: "@aria/desktop",
    packageJsonPath: "packages/desktop/package.json",
    sourcePath: "packages/desktop/src/index.ts",
    appWrapperPath: "apps/aria-desktop/src/index.ts",
    expectedWrapperSource: 'export * from "@aria/desktop";',
  },
  {
    packageName: "@aria/mobile",
    packageJsonPath: "packages/mobile/package.json",
    sourcePath: "packages/mobile/src/index.ts",
    appWrapperPath: "apps/aria-mobile/src/index.ts",
    expectedWrapperSource: 'export * from "@aria/mobile";',
  },
] as const;

type RootPackageJson = {
  main?: string;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
};

type WorkspacePackageJson = {
  name?: string;
  main?: string;
  types?: string;
  bin?: Record<string, string>;
  exports?: Record<string, string>;
};

describe("Phase 8 CLI/server/runtime stability", () => {
  test("keeps future desktop/mobile package shells out of the current runtime bootstrap path", () => {
    for (const relativePath of currentBootstrapFiles) {
      const source = readRepoFile(relativePath);
      for (const seam of futureClientShellSeams) {
        expect(source).not.toContain(seam);
      }
    }
  });

  test("preserves the CLI-owned root entrypoints while client package seams evolve", () => {
    const rootPackage = readRepoJson<RootPackageJson>("package.json");

    expect(rootPackage.main).toBe("packages/cli/src/index.ts");
    expect(rootPackage.bin?.aria).toBe("dist/index.js");
    expect(rootPackage.scripts?.dev).toBe("bun run packages/cli/src/index.ts");
    expect(rootPackage.scripts?.build).toContain("bun build packages/cli/src/index.ts");
  });

  test("keeps future @aria/desktop and @aria/mobile package seams client-facing when they exist", () => {
    for (const candidate of futureClientPackages) {
      const packageJsonPath = join(import.meta.dir, "..", candidate.packageJsonPath);
      const sourcePath = join(import.meta.dir, "..", candidate.sourcePath);
      const appWrapperPath = join(import.meta.dir, "..", candidate.appWrapperPath);

      if (!existsSync(packageJsonPath) || !existsSync(sourcePath) || !existsSync(appWrapperPath)) {
        continue;
      }

      const manifest = readRepoJson<WorkspacePackageJson>(candidate.packageJsonPath);
      const source = readRepoFile(candidate.sourcePath);
      const appWrapperSource = readRepoFile(candidate.appWrapperPath).trim();

      expect(manifest.name).toBe(candidate.packageName);
      expect(manifest.main).toBe("./src/index.ts");
      expect(manifest.types).toBe("./src/index.ts");
      expect(manifest.bin).toBeUndefined();
      expect(manifest.exports?.["."]).toBe("./src/index.ts");
      expect(appWrapperSource).toBe(candidate.expectedWrapperSource);

      for (const disallowedImport of ["@aria/runtime", "@aria/server", "packages/runtime", "packages/server"]) {
        expect(source).not.toContain(disallowedImport);
      }
    }
  });
});
