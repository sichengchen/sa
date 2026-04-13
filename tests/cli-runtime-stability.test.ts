import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ariaDesktopApp, ariaDesktopHost } from "../apps/aria-desktop/src/index.js";
import { ariaMobileApp, ariaMobileHost } from "../apps/aria-mobile/src/index.js";

const REPO_DIR = fileURLToPath(new URL("..", import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_DIR, relativePath), "utf-8");
}

function readRepoJson<T>(relativePath: string): T {
  return JSON.parse(readRepoFile(relativePath)) as T;
}

const desktopLocalSeams = ["@aria/desktop-bridge", "@aria/desktop-git"];
const futureClientShellSeams = [
  "@aria/desktop",
  "@aria/mobile",
  "packages/desktop",
  "packages/mobile",
];
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
    packageName: "@aria/desktop",
    packageJsonPath: "packages/desktop/package.json",
    sourcePath: "packages/desktop/src/index.ts",
    appWrapperPath: "apps/aria-desktop/src/index.ts",
    appHostPath: "apps/aria-desktop/src/host.ts",
    appAssemblyPath: "apps/aria-desktop/src/app.ts",
    expectedHostId: "aria-desktop",
    expectedShellPackage: "@aria/desktop",
  },
  {
    packageName: "@aria/mobile",
    packageJsonPath: "packages/mobile/package.json",
    sourcePath: "packages/mobile/src/index.ts",
    appWrapperPath: "apps/aria-mobile/src/index.ts",
    expectedHostId: "aria-mobile",
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
  test("keeps desktop-local seams out of current server bootstrap paths", () => {
    for (const relativePath of coreRuntimeBootstrapFiles) {
      const source = readRepoFile(relativePath);
      for (const desktopLocalSeam of desktopLocalSeams) {
        expect(source).not.toContain(desktopLocalSeam);
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
    const appMain = readRepoFile("apps/aria-server/src/main.ts");

    expect(cliIndex).toContain('await import("aria-server");');
    expect(cliIndex).toContain("__server_host");
    expect(cliEngine).toContain('from "@aria/server/daemon";');
    expect(runtimeDiscovery).toContain('from "@aria/server/discovery";');
    expect(serverDaemon).toContain("ARIA_SERVER_DAEMON_COMMAND");
    expect(serverDaemon).toContain(
      "spawn(process.execPath, [process.argv[1], ARIA_SERVER_DAEMON_COMMAND]",
    );
    expect(appIndex).toContain('from "@aria/server"');
    expect(appIndex).toContain("ARIA_SERVER_DAEMON_COMMAND");
    expect(appMain).toContain('import { RUNTIME_NAME } from "@aria/server";');
    expect(appMain).toContain('import { runAriaServerDaemonHost } from "./index.js";');
    expect(appMain).toContain("runAriaServerDaemonHost().catch");
  });

  test("preserves the CLI-owned root entrypoints while client package shells evolve", () => {
    const rootPackage = readRepoJson<RootPackageJson>("package.json");

    expect(rootPackage.main).toBe("packages/cli/src/index.ts");
    expect(rootPackage.bin?.aria).toBe("dist/index.mjs");
    expect(rootPackage.scripts?.dev).toBe("bun run packages/cli/src/index.ts");
    expect(rootPackage.scripts?.build).toBe("vp run repo:build");
  });

  test("keeps desktop and mobile app seams client-facing", () => {
    const desktopSource = readRepoFile("apps/aria-desktop/src/index.ts");
    const mobileSource = readRepoFile("apps/aria-mobile/src/index.ts");

    expect(ariaDesktopApp.sharedPackages).not.toContain("@aria/runtime");
    expect(ariaDesktopApp.sharedPackages).not.toContain("@aria/server");
    expect(ariaMobileApp.sharedPackages).not.toContain("@aria/runtime");
    expect(ariaMobileApp.sharedPackages).not.toContain("@aria/server");
    expect(ariaDesktopHost.shellPackage).toBe("@aria/desktop");
    expect(ariaMobileHost.shellPackage).toBe("@aria/mobile");
    expect(ariaDesktopHost.contextPanels.map((panel) => panel.id)).toContain("environment");
    expect(ariaMobileHost.actionSections.map((section) => section.id)).toContain("remote-review");

    for (const disallowedImport of [
      "@aria/runtime",
      "@aria/server",
      "packages/runtime",
      "packages/server",
    ]) {
      expect(desktopSource).not.toContain(disallowedImport);
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

      if (candidate.packageName === "@aria/desktop") {
        const appHostSource = readRepoFile(candidate.appHostPath);
        const appAssemblySource = readRepoFile(candidate.appAssemblyPath);

        expect(appWrapperSource).toContain(`export * from "${candidate.expectedShellPackage}";`);
        expect(appWrapperSource).toContain('export * from "./host.js";');
        expect(appWrapperSource).toContain('export * from "./app.js";');
        expect(appHostSource).toContain(`id: "${candidate.expectedHostId}"`);
        expect(appHostSource).toContain(`shellPackage: "${candidate.expectedShellPackage}"`);
        expect(appAssemblySource).toContain(`id: "${candidate.expectedHostId}"`);
        expect(appAssemblySource).toContain(`shellPackage: "${candidate.expectedShellPackage}"`);
      }

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
