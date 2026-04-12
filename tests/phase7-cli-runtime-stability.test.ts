import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ariaDesktopApp, ariaDesktopHost } from "../apps/aria-desktop/src/index.js";
import { ariaMobileApp, ariaMobileHost } from "../apps/aria-mobile/src/index.js";

function readRepoFile(relativePath: string): string {
  return readFileSync(join(import.meta.dir, "..", relativePath), "utf-8");
}

const desktopLocalSeams = ["@aria/desktop-bridge", "@aria/desktop-git"];
const coreRuntimeBootstrapFiles = [
  "packages/cli/src/index.ts",
  "packages/cli/src/engine.ts",
  "packages/runtime/src/engine.ts",
  "packages/server/src/app.ts",
  "packages/server/src/engine.ts",
  "apps/aria-server/src/main.ts",
] as const;

describe("Phase 7 CLI/server/runtime stability", () => {
  test("keeps desktop-local seams out of the current CLI/server/runtime bootstrap path", () => {
    for (const relativePath of coreRuntimeBootstrapFiles) {
      const source = readRepoFile(relativePath);
      for (const desktopLocalSeam of desktopLocalSeams) {
        expect(source).not.toContain(desktopLocalSeam);
      }
    }
  });

  test("preserves the current runtime daemon and server-app entry wiring", () => {
    const cliIndex = readRepoFile("packages/cli/src/index.ts");
    const cliEngine = readRepoFile("packages/cli/src/engine.ts");
    const runtimeEngine = readRepoFile("packages/runtime/src/engine.ts");
    const runtimeDiscovery = readRepoFile("packages/runtime/src/discovery.ts");
    const serverEngine = readRepoFile("packages/server/src/engine.ts");
    const appIndex = readRepoFile("apps/aria-server/src/index.ts");
    const appMain = readRepoFile("apps/aria-server/src/main.ts");

    expect(cliIndex).toContain('await import("@aria/server/engine");');
    expect(cliEngine).toContain('from "@aria/server/daemon";');
    expect(runtimeEngine).toContain('export * from "@aria/server/engine";');
    expect(runtimeDiscovery).toContain('from "@aria/server/discovery";');
    expect(serverEngine).toContain('import { startAriaServer } from "./app.js";');
    expect(serverEngine).toContain('import { getRuntimeDiscoveryPaths } from "./discovery.js";');
    expect(appIndex).toContain('from "@aria/server"');
    expect(appMain.trim()).toBe('import "@aria/server/engine";');
  });

  test("keeps desktop and mobile app seams client-facing instead of re-owning runtime/server behavior", () => {
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

    for (const disallowedImport of ["@aria/runtime", "@aria/server", "packages/runtime", "packages/server"]) {
      expect(desktopSource).not.toContain(disallowedImport);
      expect(mobileSource).not.toContain(disallowedImport);
    }
  });
});
