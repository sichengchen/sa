import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ariaMobileApp, ariaMobileHost } from "aria-mobile";

const REPO_DIR = fileURLToPath(new URL("..", import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_DIR, relativePath), "utf-8");
}

function readRepoJson<T>(relativePath: string): T {
  return JSON.parse(readRepoFile(relativePath)) as T;
}

const removedDesktopSeams = [
  "@aria/desktop",
  "@aria/desktop-bridge",
  "@aria/desktop-git",
  "@aria/desktop-ui",
  "aria-desktop",
  "packages/desktop",
  "packages/desktop-bridge",
  "packages/desktop-git",
  "packages/desktop-ui",
  "apps/aria-desktop",
];
const futureClientShellSeams = ["@aria/mobile", "packages/mobile"];
const currentBootstrapFiles = [
  "package.json",
  "packages/cli/src/index.ts",
  "packages/cli/src/engine.ts",
  "packages/server/src/app.ts",
  "apps/aria-server/src/index.ts",
] as const;
const coreRuntimeBootstrapFiles = [
  "packages/cli/src/index.ts",
  "packages/cli/src/engine.ts",
  "packages/server/src/app.ts",
  "apps/aria-server/src/main.ts",
] as const;

const futureClientPackages = [
  {
    packageName: "@aria/mobile",
    packageJsonPath: "packages/mobile/package.json",
    sourcePath: "packages/mobile/src/index.ts",
    appWrapperPath: "apps/aria-mobile/src/index.ts",
    expectedShellPackage: "@aria/mobile",
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

describe("cli and runtime stability", () => {
  test("keeps removed desktop seams out of current server bootstrap paths", () => {
    for (const relativePath of coreRuntimeBootstrapFiles) {
      const source = readRepoFile(relativePath);
      for (const seam of removedDesktopSeams) {
        expect(source).not.toContain(seam);
      }
    }
  });

  test("keeps client package shells out of current runtime bootstrap paths", () => {
    for (const relativePath of currentBootstrapFiles) {
      const source = readRepoFile(relativePath);
      for (const seam of futureClientShellSeams) {
        expect(source).not.toContain(seam);
      }
    }
  });

  test("preserves current CLI and server bootstrap wiring", () => {
    const cliIndex = readRepoFile("packages/cli/src/index.ts");
    const cliEngine = readRepoFile("packages/cli/src/engine.ts");
    const runtimeDiscovery = readRepoFile("packages/runtime/src/discovery.ts");
    const serverDaemon = readRepoFile("packages/server/src/daemon.ts");
    const appIndex = readRepoFile("apps/aria-server/src/index.ts");
    const appProcess = readRepoFile("apps/aria-server/src/process.ts");
    const appMain = readRepoFile("apps/aria-server/src/main.ts");

    expect(cliIndex).toContain('await import("aria-server");');
    expect(cliIndex).toContain("__server_host");
    expect(cliEngine).toContain('from "@aria/server/daemon";');
    expect(runtimeDiscovery).toContain('from "@aria/server/discovery";');
    expect(serverDaemon).toContain('from "aria-server/process";');
    expect(serverDaemon).toContain("spawnAriaServerDaemonHost");
    expect(appIndex).toContain('from "@aria/server"');
    expect(appIndex).toContain("ARIA_SERVER_DAEMON_COMMAND");
    expect(appIndex).toContain("spawnAriaServerDaemonHost");
    expect(appProcess).toContain('fileURLToPath(new URL("./main.ts", import.meta.url))');
    expect(appProcess).toContain("cli_hidden_command");
    expect(appMain).toContain('import { RUNTIME_NAME } from "@aria/server";');
    expect(appMain).toContain('import { runAriaServerDaemonHost } from "./index.js";');
    expect(appMain).toContain("runAriaServerDaemonHost().catch");
  });

  test("preserves the CLI-owned root entrypoints while client package shells evolve", () => {
    const rootPackage = readRepoJson<RootPackageJson>("package.json");

    expect(rootPackage.main).toBe("packages/cli/src/index.ts");
    expect(rootPackage.bin?.aria).toBe("dist/index.mjs");
    expect(rootPackage.scripts?.dev).toBe("bun run dev:server");
    expect(rootPackage.scripts?.["dev:server"]).toBe("cd apps/aria-server && bun run dev");
    expect(rootPackage.scripts?.["dev:desktop"]).toBe("cd apps/aria-desktop && bun run dev");
    expect(rootPackage.scripts?.["dev:mobile"]).toBe("cd apps/aria-mobile && bun run dev");
    expect(rootPackage.scripts?.build).toBe("vp run repo:build");
  });

  test("keeps the mobile app seam client-facing", () => {
    const mobileSource = readRepoFile("apps/aria-mobile/src/index.ts");

    expect(ariaMobileApp.sharedPackages).not.toContain("@aria/runtime");
    expect(ariaMobileApp.sharedPackages).not.toContain("@aria/server");
    expect(ariaMobileHost.shellPackage).toBe("@aria/mobile");
    expect(ariaMobileHost.actionSections.map((section) => section.id)).toContain("remote-review");

    for (const disallowedImport of [
      "@aria/runtime",
      "@aria/server",
      "packages/runtime",
      "packages/server",
    ]) {
      expect(mobileSource).not.toContain(disallowedImport);
    }
  });

  test("keeps client package shells client-facing when they exist", () => {
    for (const candidate of futureClientPackages) {
      const packageJsonPath = join(REPO_DIR, candidate.packageJsonPath);
      const sourcePath = join(REPO_DIR, candidate.sourcePath);
      const appWrapperPath = join(REPO_DIR, candidate.appWrapperPath);

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
      expect(appWrapperSource).toContain(`export * from "${candidate.expectedShellPackage}";`);

      for (const disallowedImport of [
        "@aria/runtime",
        "@aria/server",
        "packages/runtime",
        "packages/server",
      ]) {
        expect(source).not.toContain(disallowedImport);
      }
    }
  });
});
