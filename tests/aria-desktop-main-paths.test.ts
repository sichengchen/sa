import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const REPO_DIR = fileURLToPath(new URL("..", import.meta.url));

describe("desktop main paths", () => {
  test("uses the emitted preload module entry", async () => {
    const { getDesktopPreloadPath } =
      await import("../apps/aria-desktop/src/main/desktop-main-paths.js");

    expect(basename(getDesktopPreloadPath("/tmp/aria-desktop/dist/main"))).toBe("index.mjs");
  });

  test("creates the Aria service after the local runtime is ready", () => {
    const source = readFileSync(`${REPO_DIR}/apps/aria-desktop/src/main/index.ts`, "utf-8");
    const ensureIndex = source.indexOf("await ensureEngine();");
    const serviceIndex = source.indexOf("desktopAriaService = new DesktopAriaService();");

    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(serviceIndex).toBeGreaterThan(ensureIndex);
  });
});
