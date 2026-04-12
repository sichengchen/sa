import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRepoFile(relativePath: string): string {
  return readFileSync(join(import.meta.dir, "..", relativePath), "utf-8");
}

describe("Phase 6 CLI/server stability", () => {
  test("keeps runtime discovery-file paths centralized across engine entrypoints", () => {
    const runtimeEngine = readRepoFile("packages/runtime/src/engine.ts");
    const runtimeDiscovery = readRepoFile("packages/runtime/src/discovery.ts");
    const serverEngine = readRepoFile("packages/server/src/engine.ts");

    expect(runtimeEngine).toContain('export * from "@aria/server/engine";');
    expect(runtimeDiscovery).toContain('from "@aria/server/discovery";');
    expect(serverEngine).toContain('import { getRuntimeDiscoveryPaths } from "./discovery.js";');
    expect(serverEngine).toContain("restartMarkerFile: RESTART_MARKER");
    expect(serverEngine).toContain("const logFd = openSync(LOG_FILE, \"a\");");
  });

  test("preserves the current CLI and app bootstrap wiring", () => {
    const cliIndex = readRepoFile("packages/cli/src/index.ts");
    const appIndex = readRepoFile("apps/aria-server/src/index.ts");
    const appMain = readRepoFile("apps/aria-server/src/main.ts");

    expect(cliIndex).toContain('await import("@aria/server/engine");');
    expect(appIndex).toContain('export * from "@aria/server";');
    expect(appIndex).toContain('export const ariaServerHost = {');
    expect(appIndex).toContain('shellPackage: "@aria/server"');
    expect(appIndex).toContain("createAriaServerHostBootstrap");
    expect(appMain.trim()).toBe('import "@aria/server/engine";');
  });
});
