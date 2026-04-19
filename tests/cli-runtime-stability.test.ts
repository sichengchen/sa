import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
const removedClientShellSeams = [
  "@aria/mobile",
  "packages/mobile",
  "aria-mobile",
  "apps/aria-mobile",
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

type RootPackageJson = {
  main?: string;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
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
      for (const seam of removedClientShellSeams) {
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
    expect(rootPackage.scripts?.["dev:mobile"]).toBeUndefined();
    expect(rootPackage.scripts?.build).toBe("vp run repo:build");
  });

  test("keeps the repo build pipeline building the desktop app", () => {
    const viteConfig = readRepoFile("vite.config.ts");

    expect(viteConfig).toContain(
      'command:\n          "vp run repo:prepare-skills && vp pack && bun run --cwd apps/aria-desktop build"',
    );
  });

  test("removes the mobile shell package seams from the repo", () => {
    expect(existsSync(join(REPO_DIR, "packages/mobile/package.json"))).toBe(false);
    expect(existsSync(join(REPO_DIR, "apps/aria-mobile/package.json"))).toBe(false);
  });

  test("removes the old @aria/ui package seam from the repo", () => {
    expect(existsSync(join(REPO_DIR, "packages/ui/package.json"))).toBe(false);
  });
});
